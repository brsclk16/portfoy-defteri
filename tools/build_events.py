#!/usr/bin/env python3
"""Portföy Defteri — olay sonrası tarihsel oranlar (GitHub Actions'ta, anahtarsız + SEC_UA).

Soru: "Bu hissede şu olay olduğunda sonraki 1 hafta / 1 ay / 3 ayda ne oldu — ve bu, aynı hissede rastgele bir günden farklı mı?"

Olaylar
  bilanço   : SEC EDGAR 8-K "Item 2.02 (Results of Operations)" bildirimleri, 2010'dan beri. Tepki = tepki günü kapanışı / önceki kapanış,
              SPY'a göre fark. Tepki günü SEC kabul saatinden: 16:00 (ABD doğu) sonrası ertesi gün, öncesi aynı gün; saat yoksa iki günden
              tepkisi büyük olan (zamanlama bir gerçek, yön değil). Tahmin/sürpriz verisinin ücretsiz
              derin geçmişi yok; piyasanın tepkisi sürprizin dürüst bir ölçüsü.
              Kovalar (hisseye göre): büyük olumlu / olumlu / olumsuz / büyük olumsuz — "büyük" = o hissenin geçmiş tepkilerinin mutlak medyanından büyük.
  içeriden  : SEC Form 4, açık piyasa alımı (kod P) — yönetici/yönetim kurulu üyesi. Alım tarihi değil, kamuya açıklandığı gün esas alınır.
              Form 4 çok sayıda olduğu için önbellekli işlenir (data/insider_hist.json); geçmiş birkaç gecede dolar.
İleri getiri : olay sonrası 5 / 21 / 63 işlem günü, SPY'a göre fark. Taban oran: aynı hissede rastgele bir günün aynı farkı (aynı dönem).
Çıktı        : data/events.json. --notify: son işlem gününe ait bilanço tepkisi varsa (doğrudan pozisyonlar) bağlamıyla Telegram'a yazar.
Kullanım     : python3 tools/build_events.py [--notify] [--budget 900]"""
import datetime as dt, json, math, os, re, sys, time, urllib.request, urllib.error, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
NOW = time.time()
BUDGET = float(sys.argv[sys.argv.index('--budget') + 1]) if '--budget' in sys.argv else 900.0
NOTIFY = '--notify' in sys.argv
H = [5, 21, 63]
START = '2010-01-01'


def _ascii(v):
    import unicodedata
    v = (v or '').translate(str.maketrans('ıİşŞçÇğĞöÖüÜ', 'iIsScCgGoOuU'))
    return unicodedata.normalize('NFKD', v).encode('ascii', 'ignore').decode().strip()


SEC_UA = _ascii(os.environ.get('SEC_UA', ''))
UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
DIAG = {'errors': {}}


def rd(n, d=None):
    try:
        with open(os.path.join(DATA, n), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return d


def wr(n, o):
    with open(os.path.join(DATA, n), 'w', encoding='utf-8') as f:
        json.dump(o, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


_last_sec = [0.0]


def get(url, sec=False, tries=3, timeout=30):
    h = {'User-Agent': SEC_UA if sec else UA_WEB, 'Accept-Encoding': 'identity'}
    last = None
    for i in range(tries):
        if sec:  # SEC: saniyede en fazla ~8 istek
            w = 0.13 - (time.time() - _last_sec[0])
            if w > 0:
                time.sleep(w)
            _last_sec[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):
                raise
            time.sleep(3 * (i + 1))
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def over():
    return time.time() - NOW > BUDGET


# ------------------------------------------------------------------ evren
def universe():
    P = rd('portfolio.json', {}) or {}
    I = P.get('instruments', {}) or {}
    direct = [t for t, v in I.items() if (v.get('type') or '').lower() == 'hisse']
    hold = {}
    for t, v in I.items():
        for h in sorted(v.get('holdings') or [], key=lambda x: -(x.get('w') or 0))[:6]:
            ht = h.get('t')
            if ht and re.match(r'^[A-Z][A-Z0-9.]{0,6}$', ht):
                hold.setdefault(ht, []).append({'t': t, 'w': h.get('w')})
    W = [(w.get('t') if isinstance(w, dict) else w) for w in (rd('watchlist.json', {}) or {}).get('tickers', [])]
    eh = list(((rd('earnhist.json', {}) or {}).get('data') or {}).keys())
    U = []
    for t in direct + list(hold) + [w for w in W if w and ':' not in w] + eh:
        t = {'NOVO.B': 'NVO'}.get(t, t)
        if t not in U:
            U.append(t)
    return U, set({'NOVO.B': 'NVO'}.get(t, t) for t in direct), hold


# ------------------------------------------------------------------ fiyat (Yahoo, düzeltilmiş kapanış)
def yahoo(sym):
    p1 = int(dt.datetime(2009, 6, 1).timestamp())
    p2 = int(time.time()) + 86400
    last = None
    for host in ('query1', 'query2'):
        try:
            j = json.loads(get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit&includeAdjustedClose=true'))
            r = j['chart']['result'][0]
            adj = r['indicators'].get('adjclose', [{}])[0].get('adjclose') or r['indicators']['quote'][0]['close']
            off = r.get('meta', {}).get('gmtoffset') or 0
            return {dt.datetime.utcfromtimestamp(t + off).date().isoformat(): c for t, c in zip(r['timestamp'], adj) if c}
        except Exception as e:
            last = e
            time.sleep(1.5)
    raise last


# ------------------------------------------------------------------ SEC
def cik_map():
    j = json.loads(get('https://www.sec.gov/files/company_tickers.json', sec=True))
    return {v['ticker'].upper(): int(v['cik_str']) for v in j.values()}


COLS = ('accessionNumber', 'filingDate', 'acceptanceDateTime', 'form', 'items', 'primaryDocument')


def submissions(cik):
    """Tüm dosyalamalar (yeni + eski sayfalar) — yalnızca 8-K ve 4, 2010 sonrası."""
    j = json.loads(get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json', sec=True))
    pages = [j['filings']['recent']]
    for f in j['filings'].get('files', []):
        if (f.get('filingTo') or '9999') < START:
            continue
        try:
            pages.append(json.loads(get('https://data.sec.gov/submissions/' + f['name'], sec=True)))
        except Exception as e:
            DIAG['errors'][f'sub:{cik}:{f["name"]}'] = str(e)[:80]
    out = []
    for p in pages:
        n = len(p.get('form', []))
        for i in range(n):
            form = p['form'][i]
            if form not in ('8-K', '8-K/A', '4') or p['filingDate'][i] < START:
                continue
            out.append({k: (p.get(k) or [''] * n)[i] for k in COLS})
    return j.get('name'), out


# ------------------------------------------------------------------ yardımcılar
class Px:
    def __init__(self, m):
        self.d = sorted(m)
        self.v = [m[x] for x in self.d]
        self.i = {x: k for k, x in enumerate(self.d)}

    def idx_ge(self, d):
        import bisect
        k = bisect.bisect_left(self.d, d)
        return k if k < len(self.d) else None


def eastern_hour(acc):
    """SEC acceptanceDateTime ABD doğu saatini taşır (sonundaki Z'ye rağmen)."""
    m = re.match(r'\d{4}-\d\d-\d\dT(\d\d):(\d\d)', acc or '')
    return int(m.group(1)) + int(m.group(2)) / 60 if m else None


def ret(P, a, b):
    return P.v[b] / P.v[a] - 1 if 0 <= a < len(P.v) and 0 <= b < len(P.v) and P.v[a] > 0 else None


def fwd(P, B, k):
    """k gününden (giriş kapanışı) itibaren 5/21/63 gün SPY'a göre fark (%)."""
    out = {}
    d0 = P.d[k]
    b0 = B.i.get(d0)
    for h in H:
        k1 = k + h
        if k1 >= len(P.d) or b0 is None:
            continue
        b1 = B.i.get(P.d[k1])
        if b1 is None:
            continue
        r, rb = ret(P, k, k1), ret(B, b0, b1)
        if r is None or rb is None:
            continue
        out[str(h)] = round((r - rb) * 100, 2)
    return out


def base_rates(P, B, k0):
    """Aynı hissede rastgele bir günün 5/21/63 gün SPY'a göre farkı (k0'dan itibaren tüm günler)."""
    out = {}
    for h in H:
        s, n = 0.0, 0
        for k in range(k0, len(P.d) - h):
            b0, b1 = B.i.get(P.d[k]), B.i.get(P.d[k + h])
            if b0 is None or b1 is None:
                continue
            r, rb = ret(P, k, k + h), ret(B, b0, b1)
            if r is None or rb is None:
                continue
            s += (r - rb) * 100
            n += 1
        out[str(h)] = round(s / n, 3) if n > 50 else None
    return out


def stats(evs, base_of):
    """[(ticker, fwd dict)] → her vade için n, ortalama, medyan, isabet, taban, katkı, t."""
    res = {}
    for h in map(str, H):
        xs = [(t, f[h]) for t, f in evs if h in f]
        if not xs:
            res[h] = {'n': 0}
            continue
        v = [x for _, x in xs]
        bs = [base_of(t).get(h) for t, _ in xs]
        bs = [b for b in bs if b is not None]
        n = len(v)
        m = sum(v) / n
        sv = sorted(v)
        med = sv[n // 2] if n % 2 else (sv[n // 2 - 1] + sv[n // 2]) / 2
        b = sum(bs) / len(bs) if bs else None
        sd = math.sqrt(sum((x - m) ** 2 for x in v) / max(1, n - 1))
        res[h] = {'n': n, 'avg': round(m, 2), 'med': round(med, 2), 'up': round(100 * sum(1 for x in v if x > 0) / n),
                  'base': None if b is None else round(b, 2), 'vsBase': None if b is None else round(m - b, 2),
                  't': None if (b is None or n < 3 or sd == 0) else round((m - b) / (sd / math.sqrt(n)), 2)}
    return res


# ------------------------------------------------------------------ bilanço
def earnings_events(t, subs, P, B):
    raw = sorted([s for s in subs if s['form'] in ('8-K', '8-K/A') and '2.02' in (s.get('items') or '')], key=lambda s: s['filingDate'])
    evs, last, agree, tot = [], None, 0, 0
    for s in raw:
        d = s['filingDate']
        if last and (dt.date.fromisoformat(d) - dt.date.fromisoformat(last)).days < 45:
            continue  # aynı çeyreğin düzeltme/ek bildirimi
        k = P.idx_ge(d)
        if k is None or k < 1:
            continue
        # aday tepki günleri: k (sabah / seans içi) ve k+1 (kapanış sonrası)
        cands = []
        for kk in (k, k + 1):
            if kk < len(P.d):
                b0, b1 = B.i.get(P.d[kk - 1]), B.i.get(P.d[kk])
                r, rb = ret(P, kk - 1, kk), (ret(B, b0, b1) if b0 is not None and b1 is not None else None)
                if r is not None and rb is not None:
                    cands.append((kk, (r - rb) * 100, r * 100))
        if not cands:
            continue
        hr = eastern_hour(s.get('acceptanceDateTime'))
        by_abs = max(cands, key=lambda c: abs(c[1]))
        by_hr = None
        # Şirketler 8-K'yı çoğu zaman sonuçları açıklamadan dakikalar önce (16:00'dan hemen önce) dosyalar; bu yüzden yalnızca
        # açılış öncesi (<9:30 → aynı gün) ve kapanış sonrası (≥16:00 → ertesi gün) kesin sayılır, arası tepkisi büyük olan günle çözülür.
        if hr is not None and P.d[k] == d:
            if hr < 9.5:
                by_hr = cands[0]
            elif hr >= 16 and len(cands) > 1:
                by_hr = cands[1]
        if by_hr:
            tot += 1
            agree += by_hr[0] == by_abs[0]
        kk, ex, raw_r = by_hr or by_abs  # önce SEC kabul saati; yoksa iki günden tepkisi büyük olan
        evs.append({'d': P.d[kk], 'filed': d, 'ex': round(ex, 2), 'r': round(raw_r, 2), 'f': fwd(P, B, kk), 'how': 'saat' if by_hr else 'tepki'})
        last = d
    if evs:
        med_abs = sorted(abs(e['ex']) for e in evs)[len(evs) // 2]
        for e in evs:
            e['b'] = ('bp' if e['ex'] >= med_abs else 'p') if e['ex'] > 0 else ('bn' if -e['ex'] >= med_abs else 'n')
    return evs, (agree, tot)


# ------------------------------------------------------------------ içeriden alım (Form 4)
def parse_form4(xml_bytes):
    root = ET.fromstring(xml_bytes)
    g = lambda el, p: (el.findtext(p) or '').strip() if el is not None else ''
    rel = root.find('.//reportingOwner/reportingOwnerRelationship')
    who = g(root, './/reportingOwner/reportingOwnerId/rptOwnerName')
    role = 'yönetici' if g(rel, 'isOfficer') in ('1', 'true') else 'YK üyesi' if g(rel, 'isDirector') in ('1', 'true') else '%10 ortak' if g(rel, 'isTenPercentOwner') in ('1', 'true') else 'diğer'
    title = g(rel, 'officerTitle')
    issuer = g(root, './/issuer/issuerCik').lstrip('0')
    buys = []
    for tr in root.findall('.//nonDerivativeTable/nonDerivativeTransaction'):
        if g(tr, 'transactionCoding/transactionCode') != 'P' or g(tr, 'transactionAmounts/transactionAcquiredDisposedCode/value') != 'A':
            continue
        try:
            sh = float(g(tr, 'transactionAmounts/transactionShares/value') or 0)
            pr = float(g(tr, 'transactionAmounts/transactionPricePerShare/value') or 0)
        except ValueError:
            continue
        buys.append({'td': g(tr, 'transactionDate/value')[:10], 'sh': sh, 'usd': round(sh * pr)})
    return who, role, title, buys, issuer


INS_START = '2013-01-01'


def insider_scan(t, cik, subs, cache, limit):
    """Önbellek tarih aralığıyla tutulur: [lo, hi] arası taranmış. Önce yeniler (hi sonrası), sonra geriye doğru (lo öncesi), gün gün."""
    C = cache.setdefault(t, {'buys': []})
    f4 = [s for s in subs if s['form'] == '4' and s['filingDate'] >= INS_START]
    hi, lo = C.get('hi'), C.get('lo')
    new = [s for s in f4 if hi is None or s['filingDate'] > hi]
    old = [s for s in f4 if lo is not None and s['filingDate'] < lo]
    if hi is None:  # ilk kez: en yeniden geriye doğru, hepsi "eski" gibi işlenir
        old, new = sorted(f4, key=lambda s: s['filingDate'], reverse=True), []
    n = 0
    # geçiş: issuer kontrolünden önce kaydedilmiş alımlar bir kez doğrulanır (şirketin başka şirketlerdeki alımları ayıklanır)
    keep = []
    for b in C['buys']:
        if b.get('iss') is not None or over():
            keep.append(b)
            continue
        s0 = next((x for x in f4 if x['accessionNumber'] == b.get('accN')), None)
        doc = re.sub(r'^xslF345X\d+/', '', (s0 or {}).get('primaryDocument') or '')
        try:
            iss = parse_form4(get(f'https://www.sec.gov/Archives/edgar/data/{cik}/{b["accN"].replace("-", "")}/{doc}', sec=True))[4] if doc.endswith('.xml') else ''
        except Exception:
            keep.append(b)
            continue
        n += 1
        if iss == str(cik):
            b['iss'] = iss
            keep.append(b)
    C['buys'] = keep
    have = {b.get('accN') for b in C['buys']}

    def one(s):
        acc = s['accessionNumber']
        doc = re.sub(r'^xslF345X\d+/', '', s.get('primaryDocument') or '')
        if not doc.endswith('.xml') or acc in have:
            return
        try:
            who, role, title, buys, issuer = parse_form4(get(f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-", "")}/{doc}', sec=True))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            return
        except ET.ParseError:
            return
        if buys and role in ('yönetici', 'YK üyesi') and issuer == str(cik):  # şirketin başka şirketlerdeki alımları değil
            C['buys'].append({'accN': acc, 'iss': issuer, 'filed': s['filingDate'], 'acc': s.get('acceptanceDateTime', ''), 'who': who[:60], 'role': role,
                              'title': title[:60], 'usd': sum(b['usd'] for b in buys), 'td': min(b['td'] for b in buys)})

    try:
        if new:
            for s in new:
                if over() or n >= limit:
                    return n
                one(s); n += 1
            C['hi'] = max(s['filingDate'] for s in new)
        days = sorted({s['filingDate'] for s in old}, reverse=True)
        for d in days:
            grp = [s for s in old if s['filingDate'] == d]
            if over() or n + len(grp) > limit + 20:
                break
            for s in grp:
                one(s); n += 1
            C['lo'] = d
            if C.get('hi') is None:
                C['hi'] = d
        if not old and C.get('hi') is None and f4:
            C['hi'] = C['lo'] = f4[0]['filingDate']
    except Exception as e:
        DIAG['errors'][f'f4:{t}'] = f'{type(e).__name__}: {str(e)[:60]}'
    lo = C.get('lo')
    C['pending'] = len([s for s in f4 if lo is None or s['filingDate'] < lo])
    C['complete'] = C['pending'] == 0
    return n


def insider_events(t, C, P, B):
    """Açıklandığı gün sonrası ilk kapanıştan giriş. Küme: 30 gün içinde ≥2 farklı kişi ya da tek alım ≥ 250 bin $."""
    buys = sorted(C.get('buys', []), key=lambda b: b['filed'])
    evs, last = [], None
    for i, b in enumerate(buys):
        win = [x for x in buys if 0 <= (dt.date.fromisoformat(b['filed']) - dt.date.fromisoformat(x['filed'])).days <= 30]
        people = {x['who'] for x in win}
        tot = sum(x['usd'] for x in win)
        if not (len(people) >= 2 or b['usd'] >= 250000):
            continue
        if last and (dt.date.fromisoformat(b['filed']) - dt.date.fromisoformat(last)).days < 30:
            continue
        hr = eastern_hour(b.get('acc'))
        k = P.idx_ge(b['filed'])
        if k is None:
            continue
        if hr is not None and hr >= 16 and P.d[k] == b['filed']:
            k += 1
        if k >= len(P.d):
            continue
        evs.append({'d': P.d[k], 'filed': b['filed'], 'people': len(people), 'usd': tot, 'f': fwd(P, B, k)})
        last = b['filed']
    return evs


# ------------------------------------------------------------------ Telegram bağlamı
def trn(v, d=1):
    return '—' if v is None else ('+' if v > 0 else '−' if v < 0 else '') + f'{abs(v):.{d}f}'.replace('.', ',')


def trp(v, d=1):
    return '—' if v is None else ('+' if v > 0 else '−' if v < 0 else '') + '%' + f'{abs(v):.{d}f}'.replace('.', ',')


BUCKET = {'bp': 'büyük olumlu', 'p': 'olumlu', 'n': 'olumsuz', 'bn': 'büyük olumsuz'}


def notify(out, direct, last_day, prev_state):
    tok, chat = os.environ.get('TG_TOKEN', '').strip(), os.environ.get('TG_CHAT', '').strip()
    sent = set(prev_state.get('notified', []))
    msgs = []
    for t, T in out['tickers'].items():
        if t not in direct:
            continue
        for e in T.get('earn', {}).get('events', [])[-2:]:
            key = f'{t}|{e["d"]}'
            if e['d'] != last_day or key in sent:
                continue
            st = T['earn']['buckets'].get(e['b'], {}).get('21', {})
            ctx = ''
            if st.get('n', 0) >= 4:
                tt, pos = st.get('t') or 0, e['b'] in ('bp', 'p')
                if abs(tt) < 2:
                    verdict = 'geçmiş, rastgele bir günden ayırt edilemiyor; tepkiye göre işlem yapmanın tarihsel bir avantajı yok'
                elif (tt > 0) == pos:
                    verdict = 'geçmişte bu tür tepkinin ardından hareket aynı yönde sürme eğiliminde'
                else:
                    verdict = 'geçmişte bu tür tepkinin ardından hareket geri dönme eğiliminde'
                ctx = (f'\nGeçmişte {st["n"]} {BUCKET[e["b"]]} tepkiden sonraki 1 ay: SPY\'a göre medyan {trn(st["med"])} puan, '
                       f'SPY\'ı geçen vaka oranı %{st["up"]} (aynı hissede rastgele gün: {trn(st["base"])}). Sonuç: {verdict}.')
            msgs.append(f'📊 {t} bilançoya SPY\'a göre {trp(e["ex"])} tepki verdi ({BUCKET[e["b"]]}).{ctx}')
            sent.add(key)
    out['notified'] = sorted(sent)[-200:]
    if not msgs:
        return 'mesaj yok'
    if not (tok and chat):
        return 'TG_TOKEN/TG_CHAT yok: ' + ' | '.join(msgs)
    body = json.dumps({'chat_id': chat, 'text': '🔔 Portföy Defteri\n' + '\n\n'.join(msgs) + '\n\nhttps://brsclk16.github.io/portfoy-defteri/',
                       'disable_web_page_preview': True}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(f'https://api.telegram.org/bot{tok}/sendMessage', data=body,
                                                      headers={'Content-Type': 'application/json'}), timeout=20)
        return f'{len(msgs)} mesaj gönderildi'
    except Exception as e:
        return f'Telegram hatası: {e}'


# ------------------------------------------------------------------ ana akış
def main():
    if not SEC_UA:
        raise SystemExit('SEC_UA secret tanımlı değil')
    U, direct, hold = universe()
    prev = rd('events.json', {}) or {}
    cache = rd('insider_hist.json', {}) or {}
    B = Px(yahoo('SPY'))
    ciks = cik_map()
    out = {'updatedAt': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'asOf': B.d[-1], 'horizons': H,
           'source': 'SEC EDGAR (8-K Item 2.02, Form 4) · Yahoo Finance (düzeltilmiş kapanış)', 'tickers': {}, 'pool': {}}
    BASE, PX, SUBS = {}, {}, {}
    all_earn, all_ins = [], []
    timing = [0, 0]
    # 1) fiyat + SEC listesi + bilanço olayları (hızlı)
    for t in U:
        try:
            cik = ciks.get(t.replace('.', '-')) or ciks.get(t)
            if not cik:
                DIAG['errors'][t] = 'SEC CIK yok'
                continue
            P = Px(yahoo(t))
            time.sleep(0.4)
            name, subs = submissions(cik)
            PX[t], SUBS[t] = P, (cik, subs)
            k0 = P.idx_ge('2010-06-01') or 0
            BASE[t] = base_rates(P, B, k0)
            ev, (ag, tot) = earnings_events(t, subs, P, B)
            timing[0] += ag
            timing[1] += tot
            T = {'name': name, 'cik': cik, 'base': BASE[t], 'from': P.d[k0], 'direct': t in direct, 'in': hold.get(t, [])}
            if ev:
                T['earn'] = {'events': ev, 'medAbs': round(sorted(abs(e['ex']) for e in ev)[len(ev) // 2], 2),
                             'upShare': round(100 * sum(1 for e in ev if e['ex'] > 0) / len(ev)),
                             'buckets': {b: stats([(t, e['f']) for e in ev if e['b'] == b], lambda _: BASE[t]) for b in BUCKET},
                             'all': stats([(t, e['f']) for e in ev], lambda _: BASE[t])}
                all_earn += [(t, e) for e in ev]
            else:
                T['earn'] = {'events': [], 'note': 'SEC 8-K 2.02 bulunamadı (yabancı şirketler 6-K ile bildirir)'}
            out['tickers'][t] = T
        except Exception as e:
            DIAG['errors'][t] = f'{type(e).__name__}: {str(e)[:100]}'
            if t in (prev.get('tickers') or {}):
                out['tickers'][t] = prev['tickers'][t]
    # 2) Form 4: kalan süre hisseler arasında sırayla paylaştırılır (önce doğrudan pozisyonlar)
    order = sorted(SUBS, key=lambda t: (t not in direct, cache.get(t, {}).get('complete', False)))
    scanned = {}
    while not over():
        moved = 0
        for t in order:
            if over():
                break
            k = insider_scan(t, SUBS[t][0], SUBS[t][1], cache, 120)
            scanned[t] = scanned.get(t, 0) + k
            moved += k
        if not moved:
            break
    DIAG['form4Scanned'] = {t: n for t, n in scanned.items() if n}
    # 3) içeriden alım olayları
    for t in SUBS:
        if t not in out['tickers']:
            continue
        iev = insider_events(t, cache.get(t, {}), PX[t], B)
        C = cache.get(t, {})
        out['tickers'][t]['ins'] = {'events': iev, 'buys': len(C.get('buys', [])), 'pending': C.get('pending', 0), 'since': C.get('lo')}
        all_ins += [(t, e) for e in iev]
    bo = lambda t: BASE.get(t) or (out['tickers'].get(t) or {}).get('base') or {}
    out['pool'] = {'earn': {b: stats([(t, e['f']) for t, e in all_earn if e['b'] == b], bo) for b in BUCKET},
                   'ins': stats([(t, e['f']) for t, e in all_ins], bo),
                   'nEarn': len(all_earn), 'nIns': len(all_ins), 'tickers': len(out['tickers'])}
    EH = ((rd('earnhist.json', {}) or {}).get('data') or {})
    ok, tot2, bad = 0, 0, []
    for t, T in out['tickers'].items():
        mine = {e['filed']: e['d'] for e in (T.get('earn') or {}).get('events', [])}
        for h in (EH.get({'NVO': 'NOVO.B'}.get(t, t)) or {}).get('hist', []):
            m = [v for f, v in mine.items() if abs((dt.date.fromisoformat(f) - dt.date.fromisoformat(h['d'])).days) <= 3]
            if not m or not h.get('rd'):
                continue
            tot2 += 1
            if m[0] == h['rd']:
                ok += 1
            elif len(bad) < 12:
                bad.append(f"{t} {h['d']}: ben {m[0]}, site {h['rd']}")
    DIAG['validation'] = {'tepki günü sitenin bilanço verisiyle uyuşuyor': f'{ok}/{tot2}', 'uyuşmayan örnekler': bad}
    DIAG['timing'] = {'kabul saati kuralı ile en büyük tepki gününün uyuşması': f'{timing[0]}/{timing[1]}'}
    DIAG['insiderPending'] = {t: c.get('pending', 0) for t, c in cache.items() if c.get('pending')}
    DIAG['budgetSec'] = BUDGET
    if NOTIFY:
        DIAG['telegram'] = notify(out, direct, B.d[-1], prev)
    else:
        out['notified'] = prev.get('notified', [])
    wr('events.json', out)
    wr('insider_hist.json', cache)
    os.makedirs(os.path.join(DATA, '_diag'), exist_ok=True)
    wr('_diag/events.json', {'at': out['updatedAt'], 'sec': round(time.time() - NOW), **DIAG})
    print(json.dumps({'tickers': len(out['tickers']), 'nEarn': out['pool']['nEarn'], 'nIns': out['pool']['nIns'], **DIAG}, ensure_ascii=False)[:3000])


if __name__ == '__main__':
    main()
