#!/usr/bin/env python3
"""Portföy Defteri — Günün fikirleri: her gün kanıta dayalı hisse ve ETF adayları (GitHub Actions'ta, anahtarsız).

YÖNTEM (önceden sabitlendi; puanlanan ne ise geriye dönük test edilen de odur):
  Hisse : 12-1 ay momentum (son 1 ay hariç 12 aylık getiri) sırası %60 + düşük oynaklık (1 yıllık günlük oynaklık, düşük iyi) sırası %40.
          Yalnızca fiyatı 200 günlük ortalamasının üstündekiler (trend filtresi).
  ETF   : 12-1 ay momentum sırası; aynı trend filtresi. (Varlık sınıfları arasında momentum ve trend en uzun kanıtı olan iki etken.)
  Akademik dayanak: momentum (Jegadeesh & Titman 1993; Asness, Moskowitz & Pedersen 2013), düşük oynaklık (Frazzini & Pedersen 2014),
  trend (Moskowitz, Ooi & Pedersen 2012). Hiçbiri garanti değildir; uzun dönemli ortalama bir eğilimdir.
KANIT : 2011'den her ay sonu, yalnızca o güne kadarki fiyatlarla en iyi 10 (ETF'de 5) seçilir, bir ay eşit ağırlıkla tutulur, %0,1 işlem maliyeti.
        Karşılaştırma: AYNI evrenin eşit ağırlıklı hali. Evren bugünün şirketlerinden oluştuğu için (hayatta kalanlar) iki taraf da şişer;
        aradaki fark yöntemin katkısıdır. Ayrıca SPY.
SANA ÖZEL: her adayın portföyle (portföydeki enstrümanların eşit ağırlıklı yaklaşığı) 1 yıllık günlük getiri korelasyonu.
        'Güçlü aday' = en yüksek puanlar; 'çeşitlendirici' = korelasyonu < 0,5 olanlar arasında en yüksek puanlar.
CANLI : her gün listeye yeni giren öneriler fiyatıyla data/ideas_log.json'a yazılır ve 5/21/63 işlem günü sonra SPY ve evrene karşı puanlanır.
Çıktı : data/ideas.json, data/ideas_log.json, data/_diag/ideas.json
Kullanım: python3 tools/ideas.py [--no-backtest]"""
import datetime as dt, json, math, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_long as fl  # Yahoo düzeltilmiş kapanış (2010'dan)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
NOW = time.time()
H = [5, 21, 63]
COST = 0.001
TOPN = {'stock': 10, 'etf': 5}
W_MOM, W_VOL = 0.6, 0.4
ETFS = {
    # sektör
    'XLK': 'Teknoloji', 'XLV': 'Sağlık', 'XLF': 'Finans', 'XLE': 'Enerji', 'XLI': 'Sanayi', 'XLY': 'Tüketici (döngüsel)', 'XLP': 'Temel tüketim',
    'XLU': 'Kamu hizmetleri', 'XLB': 'Malzeme', 'XLRE': 'Gayrimenkul', 'XLC': 'İletişim',
    # tema / alt sektör
    'SMH': 'Yarı iletken', 'SOXX': 'Yarı iletken', 'IGV': 'Yazılım', 'CIBR': 'Siber güvenlik', 'XBI': 'Biyoteknoloji', 'IHI': 'Tıbbi cihaz',
    'ITA': 'Savunma ve havacılık', 'PAVE': 'ABD altyapı', 'TAN': 'Güneş enerjisi', 'ICLN': 'Temiz enerji', 'URA': 'Uranyum', 'LIT': 'Lityum ve batarya',
    'COPX': 'Bakır madencileri', 'GDX': 'Altın madencileri', 'SIL': 'Gümüş madencileri', 'KRE': 'Bölgesel bankalar', 'XHB': 'Konut inşaatı',
    'JETS': 'Havayolları', 'XRT': 'Perakende', 'IYT': 'Taşımacılık', 'AGNG': 'Yaşlanan nüfus',
    # faktör / genel
    'SPY': 'S&P 500', 'QQQ': 'Nasdaq-100', 'IWM': 'Küçük şirketler', 'MDY': 'Orta büyüklük', 'MTUM': 'Momentum faktörü', 'QUAL': 'Kalite faktörü',
    'USMV': 'Düşük oynaklık', 'VLUE': 'Değer faktörü',
    # ülke / bölge
    'EFA': 'Gelişmiş ülkeler', 'EEM': 'Gelişmekte olan ülkeler', 'EWJ': 'Japonya', 'EWG': 'Almanya', 'EWU': 'İngiltere', 'EWZ': 'Brezilya',
    'INDA': 'Hindistan', 'FXI': 'Çin büyük şirketler', 'EWT': 'Tayvan', 'EWY': 'Güney Kore', 'EWW': 'Meksika', 'TUR': 'Türkiye',
    # tahvil
    'TLT': 'ABD uzun vade tahvil', 'IEF': 'ABD orta vade tahvil', 'SHY': 'ABD kısa vade tahvil', 'TIP': 'Enflasyona endeksli tahvil',
    'LQD': 'Yatırım yapılabilir şirket tahvili', 'HYG': 'Yüksek getirili şirket tahvili',
    # emtia
    'GLD': 'Altın', 'IAU': 'Altın', 'SLV': 'Gümüş', 'DBC': 'Emtia sepeti', 'USO': 'Ham petrol', 'DBA': 'Tarım',
}
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


def ysym(t):
    return t.replace('.', '-')


# ------------------------------------------------------------------ fiyat matrisi
def load_prices(syms):
    got = {}
    for s in syms:
        try:
            got[s] = fl.chart(ysym(s))
        except Exception as e:
            DIAG['errors'][s] = f'{type(e).__name__}: {str(e)[:60]}'
        time.sleep(0.35)
    if 'SPY' not in got:
        raise SystemExit('SPY alınamadı')
    dates = sorted(got['SPY'])
    px = {s: [got[s].get(d) for d in dates] for s in got}
    return dates, px


def ret(a, b):
    return b / a - 1 if a and b and a > 0 else None


def mom_12_1(p, i):
    """t-252 → t-21 getirisi (son ay hariç)."""
    if i < 252:
        return None
    return ret(p[i - 252], p[i - 21])


def vol_1y(p, i):
    if i < 252:
        return None
    r = [p[k] / p[k - 1] - 1 for k in range(i - 251, i + 1) if p[k] and p[k - 1]]
    if len(r) < 200:
        return None
    m = sum(r) / len(r)
    return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1) * 252)


def sma(p, i, n):
    xs = [p[k] for k in range(i - n + 1, i + 1) if p[k]]
    return sum(xs) / len(xs) if len(xs) >= n * 0.9 else None


def rank01(vals, higher_better=True):
    """{t: v} → {t: 0..1} yüzdelik sıra."""
    items = sorted((v, t) for t, v in vals.items() if v is not None)
    n = len(items)
    out = {}
    for k, (v, t) in enumerate(items):
        q = k / (n - 1) if n > 1 else 0.5
        out[t] = q if higher_better else 1 - q
    return out


def score_at(kind, names, px, i):
    """i gününde (yalnızca o güne kadarki fiyatlarla) puan ve bileşenler."""
    M, V, T = {}, {}, {}
    for t in names:
        p = px.get(t)
        if not p or not p[i]:
            continue
        m, s200 = mom_12_1(p, i), sma(p, i, 200)
        if m is None or s200 is None:
            continue
        M[t] = m
        T[t] = p[i] / s200 - 1
        if kind == 'stock':
            V[t] = vol_1y(p, i)
    rm = rank01(M, True)
    if kind == 'stock':
        rv = rank01(V, False)
        S = {t: W_MOM * rm[t] + W_VOL * rv[t] for t in rm if t in rv}
    else:
        S = dict(rm)
    elig = {t: s for t, s in S.items() if T.get(t, -1) > 0}
    return elig, S, M, V, T


# ------------------------------------------------------------------ geriye dönük test
def backtest(kind, names, dates, px):
    N = len(dates)
    me = [i for i in range(260, N - 1) if dates[i][:7] != dates[i + 1][:7]]
    hold, ew = {}, {}
    vS = vE = vB = 1.0
    curve = []
    picks_hist = []
    monthly = []
    for a, i in enumerate(me):
        elig, _, _, _, _ = score_at(kind, names, px, i)
        univ = [t for t in names if px.get(t) and px[t][i] and mom_12_1(px[t], i) is not None]
        if len(univ) < TOPN[kind] * 2 or not elig:
            continue
        top = [t for t, _ in sorted(elig.items(), key=lambda x: -x[1])[:TOPN[kind]]]
        # bir sonraki ay sonuna kadar tut
        j = me[a + 1] if a + 1 < len(me) else N - 1
        def per(ts):
            rs = [ret(px[t][i], px[t][j]) for t in ts]
            rs = [x for x in rs if x is not None]
            return sum(rs) / len(rs) if rs else 0.0
        turn = len(set(top) - set(hold)) / max(1, len(top)) if hold else 1.0
        rS = per(top) - COST * 2 * turn
        rE = per(univ)
        rB = ret(px['SPY'][i], px['SPY'][j]) or 0.0
        vS *= 1 + rS
        vE *= 1 + rE
        vB *= 1 + rB
        hold = {t: 1 for t in top}
        curve.append([dates[j], round(vS, 4), round(vE, 4), round(vB, 4)])
        monthly.append((dates[j], rS, rE, rB))
        picks_hist.append(len(top))
    if len(monthly) < 24:
        return None
    yrs = len(monthly) / 12
    cagr = lambda v: (v ** (1 / yrs) - 1) * 100
    ex = [m[1] - m[2] for m in monthly]
    mu = sum(ex) / len(ex)
    sd = math.sqrt(sum((x - mu) ** 2 for x in ex) / (len(ex) - 1))
    def mdd(k):
        pk, dd = 1, 0
        for c in curve:
            pk = max(pk, c[k])
            dd = min(dd, c[k] / pk - 1)
        return dd * 100
    years = {}
    for d, a_, b_, c_ in monthly:
        y = years.setdefault(d[:4], [1, 1, 1])
        y[0] *= 1 + a_
        y[1] *= 1 + b_
        y[2] *= 1 + c_
    return {'from': curve[0][0], 'to': curve[-1][0], 'months': len(monthly),
            'cagr': round(cagr(vS), 2), 'cagrEW': round(cagr(vE), 2), 'cagrSPY': round(cagr(vB), 2),
            'mdd': round(mdd(1), 1), 'mddEW': round(mdd(2), 1), 'mddSPY': round(mdd(3), 1),
            'exMonthly': round(mu * 100, 3), 't': round(mu / (sd / math.sqrt(len(ex))), 2) if sd > 0 else None,
            'hitMonths': round(100 * sum(1 for x in ex if x > 0) / len(ex)),
            'years': {y: [round((v[0] - 1) * 100, 1), round((v[1] - 1) * 100, 1), round((v[2] - 1) * 100, 1)] for y, v in years.items()},
            'curve': curve[::3] + ([curve[-1]] if (len(curve) - 1) % 3 else [])}


# ------------------------------------------------------------------ portföy korelasyonu
def daily_rets(p, i, n=252):
    return [(p[k] / p[k - 1] - 1) if (p[k] and p[k - 1]) else None for k in range(i - n + 1, i + 1)]


def corr(a, b):
    xs = [(x, y) for x, y in zip(a, b) if x is not None and y is not None]
    if len(xs) < 150:
        return None
    mx = sum(x for x, _ in xs) / len(xs)
    my = sum(y for _, y in xs) / len(xs)
    c = sum((x - mx) * (y - my) for x, y in xs)
    vx = sum((x - mx) ** 2 for x, _ in xs)
    vy = sum((y - my) ** 2 for _, y in xs)
    return c / math.sqrt(vx * vy) if vx > 0 and vy > 0 else None


# ------------------------------------------------------------------ canlı kayıt ve puanlama
def live_log(log, today_lists, dates, px, i):
    have = {(e['t'], e['kind']) for e in log['events'] if (NOW - time.mktime(time.strptime(e['d'], '%Y-%m-%d'))) < 30 * 86400}
    d = dates[i]
    added = 0
    for kind, lst in today_lists.items():
        for x in lst:
            key = (x['t'], kind)
            if key in have or any(e['d'] == d and e['t'] == x['t'] and e['kind'] == kind for e in log['events']):
                continue  # aynı öneri 30 gün içinde tekrar sayılmaz
            log['events'].append({'d': d, 't': x['t'], 'kind': kind, 'list': x['list'], 'px': x['px'], 'spy': px['SPY'][i]})
            added += 1
    idx = {dd: k for k, dd in enumerate(dates)}
    for e in log['events']:
        e.setdefault('r', {})
        k0 = idx.get(e['d'])
        if k0 is None or e['t'] not in px:
            continue
        for h in H:
            if str(h) in e['r'] or k0 + h > i:
                continue
            p1, s1 = px[e['t']][k0 + h], px['SPY'][k0 + h]
            if p1 and s1 and e['px'] and e['spy']:
                r_, rs = p1 / e['px'] - 1, s1 / e['spy'] - 1
                e['r'][str(h)] = {'d': dates[k0 + h], 'ret': round(r_ * 100, 2), 'ex': round((r_ - rs) * 100, 2)}
    summ = {}
    for kind in ('stock', 'etf'):
        for lst in ('guclu', 'cesit'):
            g = summ.setdefault(f'{kind}|{lst}', {'n': 0})
            evs = [e for e in log['events'] if e['kind'] == kind and e['list'] == lst]
            g['n'] = len(evs)
            for h in H:
                xs = [e['r'][str(h)]['ex'] for e in evs if str(h) in e.get('r', {})]
                if xs:
                    m = sum(xs) / len(xs)
                    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / max(1, len(xs) - 1))
                    g[str(h)] = {'n': len(xs), 'avg': round(m, 2), 'hit': round(100 * sum(1 for x in xs if x > 0) / len(xs)),
                                 't': round(m / (sd / math.sqrt(len(xs))), 2) if len(xs) > 2 and sd > 0 else None}
    log['summary'] = summ
    log['updatedAt'] = dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    return added


# ------------------------------------------------------------------ ana akış
def main():
    U = rd('universe.json', {}) or {}
    UD = U.get('data') or {}
    P = (rd('portfolio.json', {}) or {}).get('instruments', {}) or {}
    port = [{'NOVO.B': 'NVO'}.get(t, t) for t, v in P.items() if not v.get('watchlist')]
    stocks = [t for t in UD if not t.endswith('.L') and t not in ('FM',)]
    etfs = list(ETFS)
    held_funds_holdings = {}
    for t, v in P.items():
        for h in (v.get('holdings') or []):
            held_funds_holdings.setdefault(h.get('t'), []).append({'t': t, 'w': h.get('w')})
    syms = list(dict.fromkeys(['SPY'] + port + etfs + stocks))
    dates, px = load_prices(syms)
    i = len(dates) - 1
    DIAG['fiyat'] = {'sembol': len(px), 'gün': len(dates), 'ilk': dates[0], 'son': dates[i]}
    # portföy yaklaşığı: eşit ağırlıklı günlük getiri
    pr = [daily_rets(px[t], i) for t in port if t in px and px[t][i]]
    port_r = [sum(v for v in col if v is not None) / max(1, sum(1 for v in col if v is not None)) if any(v is not None for v in col) else None for col in zip(*pr)] if pr else []
    out = {'updatedAt': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'asOf': dates[i],
           'method': {'stock': f'12-1 ay momentum sırası %{int(W_MOM*100)} + düşük oynaklık sırası %{int(W_VOL*100)}; fiyat 200 günlük ortalamanın üstünde',
                      'etf': '12-1 ay momentum sırası; fiyat 200 günlük ortalamanın üstünde',
                      'fit': "Portföyle 1 yıllık günlük getiri korelasyonu (portföydeki enstrümanların eşit ağırlıklı yaklaşığı); çeşitlendirici < 0,5"},
           'lists': {}, 'backtest': {}, 'universe': {'stock': len([t for t in stocks if t in px]), 'etf': len([t for t in etfs if t in px])}}
    prev = rd('ideas.json', {}) or {}
    prev_top = {k: {x['t'] for x in v.get('guclu', []) + v.get('cesit', [])} for k, v in (prev.get('lists') or {}).items()}
    today_for_log = {}
    for kind, names in (('stock', stocks), ('etf', etfs)):
        names = [t for t in names if t in px]
        elig, S, M, V, T = score_at(kind, names, px, i)
        nrank = len(S)
        order = sorted(S.items(), key=lambda x: -x[1])
        rk = {t: k + 1 for k, (t, _) in enumerate(order)}
        rows = []
        for t, s in sorted(elig.items(), key=lambda x: -x[1])[:40]:
            c = corr(daily_rets(px[t], i), port_r) if port_r else None
            u = UD.get(t, {})
            rows.append({'t': t, 'n': u.get('n') or ETFS.get(t) or t, 'sec': u.get('sec') or ('ETF' if kind == 'etf' else None), 'ind': u.get('ind'),
                         'score': round(s * 100, 1), 'rank': rk[t], 'of': nrank, 'mom': round(M[t] * 100, 1), 'vol': round(V[t] * 100, 1) if V.get(t) else None,
                         'trend': round(T[t] * 100, 1), 'corr': None if c is None else round(c, 2), 'px': round(px[t][i], 4),
                         'pe': u.get('pe'), 'beta': u.get('beta'), 'mc': u.get('mc'),
                         'held': t in port, 'inFunds': held_funds_holdings.get(t, []), 'new': t not in prev_top.get(kind, set())})
        notheld = [r for r in rows if not r['held']]
        guclu = [dict(r, list='guclu') for r in notheld[:5]]
        cesit = [dict(r, list='cesit') for r in notheld if r['corr'] is not None and r['corr'] < 0.5 and r['t'] not in {g['t'] for g in guclu}][:3]
        out['lists'][kind] = {'guclu': guclu, 'cesit': cesit, 'all': rows[:30]}
        today_for_log[kind] = guclu[:3] + cesit[:2]
        if '--no-backtest' not in sys.argv:
            try:
                out['backtest'][kind] = backtest(kind, names, dates, px)
            except Exception as e:
                DIAG['errors'][f'backtest:{kind}'] = f'{type(e).__name__}: {str(e)[:100]}'
    if not out['backtest'] and prev.get('backtest'):
        out['backtest'] = prev['backtest']
    log = rd('ideas_log.json', None) or {'events': []}
    DIAG['canliEklenen'] = live_log(log, today_for_log, dates, px, i)
    out['live'] = log.get('summary', {})
    wr('ideas.json', out)
    wr('ideas_log.json', log)
    os.makedirs(os.path.join(DATA, '_diag'), exist_ok=True)
    wr('_diag/ideas.json', {'at': out['updatedAt'], 'sec': round(time.time() - NOW), **DIAG})
    bt = out['backtest']
    print(json.dumps({'asOf': out['asOf'], 'evren': out['universe'],
                      'hisse': [x['t'] for x in out['lists']['stock']['guclu']], 'hisseCesit': [x['t'] for x in out['lists']['stock']['cesit']],
                      'etf': [x['t'] for x in out['lists']['etf']['guclu']], 'etfCesit': [x['t'] for x in out['lists']['etf']['cesit']],
                      'test': {k: {kk: v[kk] for kk in ('from', 'cagr', 'cagrEW', 'cagrSPY', 'mdd', 'mddEW', 't', 'hitMonths')} for k, v in bt.items() if v},
                      **DIAG}, ensure_ascii=False)[:3000])


if __name__ == '__main__':
    main()
