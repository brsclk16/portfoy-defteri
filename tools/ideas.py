#!/usr/bin/env python3
"""Portföy Defteri — Günün fikirleri: her gün kanıta dayalı hisse ve ETF adayları (GitHub Actions'ta, anahtarsız).

YÖNTEM (önceden sabitlendi; puanlanan ne ise geriye dönük test edilen de odur):
  Hisse : (sürüm 2, 2026-10-13'ten) 12-1 ay momentum sırası; yalnızca fiyatı 200 günlük ortalamasının üstündekiler.
          Sürüm 1 (momentum %60 + düşük oynaklık %40) geriye dönük testte reddedildi; METHOD_LOG'a bakın.
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
W_MOM, W_VOL = 1.0, 0.0
METHOD_V = 2
METHOD_LOG = [
    {'v': 1, 'from': '2026-10-13', 'stock': '12-1 ay momentum %60 + düşük oynaklık %40; 200 günlük ortalama üstü',
     'result': "2011'den testte aynı evrenin eşit ağırlıklısının gerisinde kaldı (yılda −9,9 puan, t=−2,7). Ayrıştırma: momentum tek başına t=+3,3, düşük oynaklık tek başına t=−3,0.",
     'status': 'reddedildi'},
    {'v': 2, 'from': '2026-10-13', 'stock': '12-1 ay momentum; 200 günlük ortalama üstü (ETF yöntemiyle aynı)',
     'why': "Momentumun akademik kanıtı bu testten bağımsız; iki evrende aynı yöntem. UYARI: bu seçim sonuçlar görüldükten sonra yapıldı ve test evreni (bugünün şirketleri) momentumu kayırır; asıl hakem bu tarihten sonraki canlı karnedir.",
     'status': 'kullanımda'}]
# t: (ad, ihraççı, neye dayalı)
ETF_INFO = {
    # sektör (State Street SPDR)
    'XLK': ('Teknoloji', 'State Street', 'S&P 500 teknoloji sektörü'), 'XLV': ('Sağlık', 'State Street', 'S&P 500 sağlık sektörü'),
    'XLF': ('Finans', 'State Street', 'S&P 500 finans sektörü'), 'XLE': ('Enerji', 'State Street', 'S&P 500 enerji sektörü'),
    'XLI': ('Sanayi', 'State Street', 'S&P 500 sanayi sektörü'), 'XLY': ('Tüketici (döngüsel)', 'State Street', 'S&P 500 isteğe bağlı tüketim'),
    'XLP': ('Temel tüketim', 'State Street', 'S&P 500 temel tüketim'), 'XLU': ('Kamu hizmetleri', 'State Street', 'S&P 500 kamu hizmetleri'),
    'XLB': ('Malzeme', 'State Street', 'S&P 500 malzeme sektörü'), 'XLRE': ('Gayrimenkul', 'State Street', 'S&P 500 gayrimenkul'),
    'XLC': ('İletişim', 'State Street', 'S&P 500 iletişim hizmetleri'),
    # tema / alt sektör
    'SMH': ('Yarı iletken', 'VanEck', 'En büyük 25 yarı iletken şirketi'), 'SOXX': ('Yarı iletken', 'BlackRock', 'NYSE yarı iletken endeksi (30 şirket)'),
    'IGV': ('Yazılım', 'BlackRock', 'ABD yazılım şirketleri'), 'CIBR': ('Siber güvenlik', 'First Trust', 'Siber güvenlik şirketleri'),
    'XBI': ('Biyoteknoloji', 'State Street', 'Eşit ağırlıklı ABD biyoteknoloji'), 'IHI': ('Tıbbi cihaz', 'BlackRock', 'ABD tıbbi cihaz'),
    'ITA': ('Savunma ve havacılık', 'BlackRock', 'ABD savunma ve havacılık'), 'PAVE': ('ABD altyapı', 'Global X', 'ABD altyapı inşaatı ve malzemeleri'),
    'GRID': ('Elektrik şebekesi', 'First Trust', 'Akıllı şebeke ve elektrik altyapısı'), 'IGF': ('Küresel altyapı', 'BlackRock', 'Küresel altyapı şirketleri'),
    'TAN': ('Güneş enerjisi', 'Invesco', 'Güneş enerjisi şirketleri'), 'ICLN': ('Temiz enerji', 'BlackRock', 'Küresel temiz enerji'),
    'URA': ('Uranyum', 'Global X', 'Uranyum madencileri ve nükleer'), 'LIT': ('Lityum ve batarya', 'Global X', 'Lityum madenciliği ve batarya'),
    'COPX': ('Bakır madencileri', 'Global X', 'Bakır madencileri'), 'GDX': ('Altın madencileri', 'VanEck', 'Altın madencileri'),
    'SIL': ('Gümüş madencileri', 'Global X', 'Gümüş madencileri'), 'KRE': ('Bölgesel bankalar', 'State Street', 'ABD bölgesel bankaları'),
    'XHB': ('Konut inşaatı', 'State Street', 'ABD konut inşaatı'), 'JETS': ('Havayolları', 'US Global', 'Havayolları'),
    'XRT': ('Perakende', 'State Street', 'Eşit ağırlıklı ABD perakende'), 'IYT': ('Taşımacılık', 'BlackRock', 'ABD taşımacılık'),
    'AGNG': ('Yaşlanan nüfus', 'Global X', 'Yaşlanan nüfustan faydalanan şirketler'), 'VNQ': ('Gayrimenkul (REIT)', 'Vanguard', 'ABD gayrimenkul yatırım ortaklıkları'),
    # geniş piyasa ve büyük ihraççıların ana fonları
    'SPY': ('S&P 500', 'State Street', 'S&P 500'), 'IVV': ('S&P 500', 'BlackRock', 'S&P 500'), 'VOO': ('S&P 500', 'Vanguard', 'S&P 500'),
    'VTI': ('ABD tüm piyasa', 'Vanguard', 'CRSP ABD tüm piyasa'), 'QQQ': ('Nasdaq-100', 'Invesco', 'Nasdaq-100'),
    'IWM': ('Küçük şirketler', 'BlackRock', 'Russell 2000'), 'MDY': ('Orta büyüklük', 'State Street', 'S&P MidCap 400'),
    'ACWI': ('Dünya hisseleri', 'BlackRock', 'MSCI ACWI (gelişmiş + gelişmekte olan)'),
    'VGT': ('Teknoloji', 'Vanguard', 'MSCI ABD bilgi teknolojisi'), 'VIG': ('Temettü büyüten şirketler', 'Vanguard', 'S&P ABD temettü büyütenler'),
    'VYM': ('Yüksek temettü', 'Vanguard', 'FTSE yüksek temettü verimi'), 'FTEC': ('Teknoloji', 'Fidelity', 'MSCI ABD bilgi teknolojisi'),
    'FHLC': ('Sağlık', 'Fidelity', 'MSCI ABD sağlık'), 'FENY': ('Enerji', 'Fidelity', 'MSCI ABD enerji'), 'FDVV': ('Yüksek temettü', 'Fidelity', 'Fidelity yüksek temettü endeksi'),
    'JEPI': ('Opsiyonlu gelir', 'JPMorgan', 'Aktif: düşük oynaklıklı ABD hisseleri + S&P 500 alım opsiyonu satışı'),
    'JEPQ': ('Opsiyonlu gelir (Nasdaq)', 'JPMorgan', 'Aktif: Nasdaq-100 hisseleri + alım opsiyonu satışı'),
    'BBJP': ('Japonya', 'JPMorgan', 'Japonya büyük ve orta şirketler (düşük maliyetli endeks)'),
    'GSLC': ('ABD çok etkenli', 'Goldman Sachs', 'ActiveBeta: değer, momentum, kalite, düşük oynaklık eğilimli büyük şirketler'),
    'CGDV': ('Temettü ve değer', 'Capital Group', 'Aktif: temettü ödeyen değer hisseleri'), 'CGGR': ('Büyüme', 'Capital Group', 'Aktif: büyüme hisseleri'),
    'CGXU': ('ABD dışı odaklı', 'Capital Group', 'Aktif: ABD dışı hisseler'), 'BKLC': ('ABD büyük şirketler', 'BNY', 'ABD büyük şirketler endeksi'),
    'MTUM': ('Momentum faktörü', 'BlackRock', 'MSCI ABD momentum'), 'QUAL': ('Kalite faktörü', 'BlackRock', 'MSCI ABD kalite'),
    'USMV': ('Düşük oynaklık', 'BlackRock', 'MSCI ABD minimum oynaklık'), 'VLUE': ('Değer faktörü', 'BlackRock', 'MSCI ABD değer'),
    # ülke / bölge
    'EFA': ('Gelişmiş ülkeler', 'BlackRock', 'MSCI EAFE'), 'IEFA': ('Gelişmiş ülkeler', 'BlackRock', 'MSCI EAFE IMI'),
    'VEA': ('Gelişmiş ülkeler', 'Vanguard', 'FTSE gelişmiş ülkeler (ABD hariç)'), 'VGK': ('Avrupa', 'Vanguard', 'FTSE Avrupa'),
    'EEM': ('Gelişmekte olan ülkeler', 'BlackRock', 'MSCI gelişmekte olan'), 'IEMG': ('Gelişmekte olan ülkeler', 'BlackRock', 'MSCI gelişmekte olan IMI'),
    'VWO': ('Gelişmekte olan ülkeler', 'Vanguard', 'FTSE gelişmekte olan'), 'EMXC': ('Gelişmekte olanlar (Çin hariç)', 'BlackRock', 'MSCI gelişmekte olan (Çin hariç)'),
    'EWJ': ('Japonya', 'BlackRock', 'MSCI Japonya'), 'EWG': ('Almanya', 'BlackRock', 'MSCI Almanya'), 'EWU': ('İngiltere', 'BlackRock', 'MSCI İngiltere'),
    'EWZ': ('Brezilya', 'BlackRock', 'MSCI Brezilya'), 'INDA': ('Hindistan', 'BlackRock', 'MSCI Hindistan'), 'FXI': ('Çin büyük şirketler', 'BlackRock', 'FTSE Çin 50'),
    'EWT': ('Tayvan', 'BlackRock', 'MSCI Tayvan'), 'EWY': ('Güney Kore', 'BlackRock', 'MSCI Kore'), 'EWW': ('Meksika', 'BlackRock', 'MSCI Meksika'),
    'TUR': ('Türkiye', 'BlackRock', 'MSCI Türkiye'),
    # tahvil
    'AGG': ('ABD toplam tahvil', 'BlackRock', 'Bloomberg ABD toplam tahvil'), 'BND': ('ABD toplam tahvil', 'Vanguard', 'Bloomberg ABD toplam tahvil'),
    'TLT': ('ABD uzun vade tahvil', 'BlackRock', '20+ yıl ABD devlet tahvili'), 'IEF': ('ABD orta vade tahvil', 'BlackRock', '7-10 yıl ABD devlet tahvili'),
    'SHY': ('ABD kısa vade tahvil', 'BlackRock', '1-3 yıl ABD devlet tahvili'), 'TIP': ('Enflasyona endeksli tahvil', 'BlackRock', 'ABD TIPS'),
    'LQD': ('Kaliteli şirket tahvili', 'BlackRock', 'Yatırım yapılabilir ABD şirket tahvili'), 'HYG': ('Yüksek getirili şirket tahvili', 'BlackRock', 'Yüksek getirili ABD şirket tahvili'),
    'EMB': ('Gelişmekte olan ülke tahvili', 'BlackRock', 'Dolar cinsi gelişmekte olan devlet tahvili'),
    'JPST': ('Ultra kısa gelir', 'JPMorgan', 'Aktif: ultra kısa vadeli yatırım yapılabilir tahvil'), 'MINT': ('Ultra kısa vade', 'PIMCO', 'Aktif: kısa vadeli gelişmiş tahvil'),
    'BOND': ('Aktif tahvil', 'PIMCO', 'Aktif: çekirdek tahvil'), 'FBND': ('Toplam tahvil', 'Fidelity', 'Aktif: toplam tahvil'),
    # emtia
    'GLD': ('Altın', 'State Street', 'Fiziki altın'), 'IAU': ('Altın', 'BlackRock', 'Fiziki altın'), 'SLV': ('Gümüş', 'BlackRock', 'Fiziki gümüş'),
    'DBC': ('Emtia sepeti', 'Invesco', 'Enerji, metal ve tarım vadelileri'), 'USO': ('Ham petrol', 'US Commodity Funds', 'WTI petrol vadelileri'),
    'DBA': ('Tarım', 'Invesco', 'Tarım emtia vadelileri'),
}
ETFS = {t: v[0] for t, v in ETF_INFO.items()}
# yinelenen maruziyetler (aynı endeks farklı ihraççı): öneride biri yeter, karşılaştırmada hepsi görünür
DUP = [{'SPY', 'IVV', 'VOO'}, {'EFA', 'IEFA', 'VEA'}, {'EEM', 'IEMG', 'VWO'}, {'AGG', 'BND'}, {'GLD', 'IAU'}, {'XLK', 'VGT', 'FTEC'}, {'XLV', 'FHLC'}, {'XLE', 'FENY'}, {'SMH', 'SOXX'}]
# hisse sektörü / ETF → büyük yönetici görüşlerindeki tema
ETF_THEME = {'SPY': 'us_eq', 'IVV': 'us_eq', 'VOO': 'us_eq', 'VTI': 'us_eq', 'BKLC': 'us_eq', 'GSLC': 'us_eq', 'QQQ': 'us_eq', 'IWM': 'us_small',
             'VLUE': 'us_value', 'CGDV': 'us_value', 'VYM': 'us_value', 'FDVV': 'us_value', 'SMH': 'ai_semis', 'SOXX': 'ai_semis', 'GRID': 'ai_infra', 'PAVE': 'ai_infra',
             'VGK': 'europe_eq', 'EWG': 'europe_eq', 'EWU': 'europe_eq', 'EWJ': 'japan_eq', 'BBJP': 'japan_eq', 'EEM': 'em_eq', 'IEMG': 'em_eq', 'VWO': 'em_eq',
             'EMXC': 'em_xchina', 'FXI': 'china_eq', 'INDA': 'india_eq', 'EWY': 'korea_taiwan', 'EWT': 'korea_taiwan', 'ITA': 'industrials_def', 'XLI': 'industrials_def',
             'XLF': 'financials', 'KRE': 'financials', 'XLE': 'energy', 'FENY': 'energy', 'XLV': 'healthcare', 'FHLC': 'healthcare', 'IHI': 'healthcare', 'IGF': 'infrastructure',
             'TLT': 'ust_long', 'IEF': 'ust_mid', 'SHY': 'short_bonds', 'JPST': 'short_bonds', 'MINT': 'short_bonds', 'LQD': 'ig_credit', 'HYG': 'high_yield', 'EMB': 'em_debt',
             'TIP': 'tips', 'GLD': 'gold', 'IAU': 'gold', 'DBC': 'commodities'}
SEC_THEME = {'Industrials': 'industrials_def', 'Financial Services': 'financials', 'Energy': 'energy', 'Healthcare': 'healthcare', 'Utilities': 'infrastructure', 'Basic Materials': 'commodities'}


def stock_themes(u):
    th = ['us_eq']
    if 'emiconductor' in (u.get('ind') or ''):
        th.append('ai_semis')
    if SEC_THEME.get(u.get('sec')):
        th.append(SEC_THEME[u['sec']])
    return th


# ------------------------------------------------------------------ büyük yöneticiler
def house_layer(HV, dates, px, i):
    """Tema başına görüş özeti + her görüşün yayın tarihinden bu yana karnesi (tema ETF'si − karşılaştırma)."""
    if not HV:
        return {}, {}
    T = HV.get('themes', {})
    today = dt.date.fromisoformat(dates[i])
    idx = {d: k for k, d in enumerate(dates)}
    def k_on(d):
        for k in range(len(dates)):
            if dates[k] >= d:
                return k
        return None
    cons, card = {}, {}
    for h in HV.get('houses', []):
        age = (today - dt.date.fromisoformat(h['date'])).days
        stale = dates[i] > h.get('validUntil', '9999')  # ufku geçmiş görüş uzlaşıya katılmaz
        k0 = k_on(h['date'])
        hits, n = 0, 0
        rows = []
        for th, (st, why) in (h.get('views') or {}).items():
            meta = T.get(th) or {}
            c = cons.setdefault(th, {'n': meta.get('n', th), 'pos': [], 'neg': [], 'neu': []})
            (c['pos'] if st > 0 else c['neg'] if st < 0 else c['neu']).append({'h': h['n'], 'id': h['id'], 'date': h['date'], 'stale': stale, 'why': why})
            e, b = meta.get('etf'), meta.get('bench')
            res = None
            if k0 is not None and e in px and b in px and px[e][k0] and px[e][i] and px[b][k0] and px[b][i] and i - k0 >= 21:
                ex = (px[e][i] / px[e][k0] - (px[b][i] / px[b][k0])) * 100
                res = round(ex, 1)
                if st != 0:
                    n += 1
                    hits += (ex > 0) == (st > 0)
            rows.append({'th': th, 'st': st, 'ex': res, 'etf': e, 'bench': b})
        card[h['id']] = {'n': h['n'], 'date': h['date'], 'age': age, 'stale': stale, 'validUntil': h.get('validUntil'), 'horizon': h.get('horizon'), 'hits': hits, 'calls': n, 'rows': rows}
    for th, c in cons.items():
        c['score'] = sum(1 for x in c['pos'] if not x['stale']) - sum(1 for x in c['neg'] if not x['stale'])
    return cons, card


def news_for(t, name, NR, KH, by_name=True):
    """Adayla ilgili son başlıklar: ham haber (ticker etiketi ya da ad) + Kıssadan Hisse (ad geçiyorsa)."""
    import re
    junk = re.compile(r'zacks|motley fool|stock price, news, quote|top \d+ |best .{0,30}stocks|should you buy|is it time to|price prediction', re.I)
    short = re.sub(r'\b(Inc|Corp|Corporation|Holdings?|Group|Co|Company|Ltd|plc|N\.V\.|S\.A\.|The)\b\.?', '', name or '', flags=re.I).strip(' ,.') if name else ''
    pat = re.compile(r'(?<![\w])' + re.escape(short) + r'(?![a-zçğıöşü])', re.I) if by_name and len(short) >= 4 else None
    out = []
    for it in (NR.get('items') or []):
        if junk.search(it.get('title') or ''):
            continue
        if t in (it.get('tickers') or []) or (pat and pat.search(it.get('title') or '')):
            out.append({'title': it['title'][:160], 'url': it.get('url'), 'src': it.get('source'), 'd': (it.get('publishedAt') or '')[:10]})
    for b in (KH.get('briefs') or [])[:5]:
        for it in b.get('items') or []:
            if pat and pat.search(it.get('title', '') + ' ' + it.get('summary', '')):
                out.append({'title': it['title'][:160], 'url': it.get('url'), 'src': (it.get('source') or '') + ' · Kıssadan Hisse', 'd': b['date'], 'tr': 1})
    seen, res = set(), []
    for x in sorted(out, key=lambda x: x['d'], reverse=True):
        k = x['title'][:60].lower()
        if k not in seen:
            seen.add(k)
            res.append(x)
    return res[:3]


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


def score_at(kind, names, px, i, wm=None, wv=None):
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
    if kind == 'stock' and (W_VOL if wv is None else wv) > 0:
        rv = rank01(V, False)
        a, b = (W_MOM if wm is None else wm), (W_VOL if wv is None else wv)
        S = {t: a * rm[t] + b * rv[t] for t in rm if t in rv}
    else:
        S = dict(rm)
    elig = {t: s for t, s in S.items() if T.get(t, -1) > 0}
    return elig, S, M, V, T


# ------------------------------------------------------------------ geriye dönük test
def backtest(kind, names, dates, px, wm=None, wv=None):
    N = len(dates)
    me = [i for i in range(260, N - 1) if dates[i][:7] != dates[i + 1][:7]]
    hold, ew = {}, {}
    vS = vE = vB = 1.0
    curve = []
    picks_hist = []
    monthly = []
    for a, i in enumerate(me):
        elig, _, _, _, _ = score_at(kind, names, px, i, wm, wv)
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
            log['events'].append({'d': d, 't': x['t'], 'kind': kind, 'list': x['list'], 'px': x['px'], 'spy': px['SPY'][i], 'v': METHOD_V})
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
            evs = [e for e in log['events'] if e['kind'] == kind and e['list'] == lst and (kind == 'etf' or e.get('v', 1) == METHOD_V)]
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
    HV = rd('house_views.json', {}) or {}
    NR = rd('news_raw.json', {}) or {}
    KH = rd('kissadan.json', {}) or {}
    syms = list(dict.fromkeys(['SPY'] + port + etfs + stocks))
    dates, px = load_prices(syms)
    i = len(dates) - 1
    DIAG['fiyat'] = {'sembol': len(px), 'gün': len(dates), 'ilk': dates[0], 'son': dates[i]}
    # portföy yaklaşığı: eşit ağırlıklı günlük getiri
    pr = [daily_rets(px[t], i) for t in port if t in px and px[t][i]]
    port_r = [sum(v for v in col if v is not None) / max(1, sum(1 for v in col if v is not None)) if any(v is not None for v in col) else None for col in zip(*pr)] if pr else []
    out = {'updatedAt': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'asOf': dates[i],
           'methodLog': METHOD_LOG, 'methodV': METHOD_V,
           'method': {'stock': '12-1 ay momentum sırası; fiyat 200 günlük ortalamanın üstünde (sürüm 2)',
                      'etf': '12-1 ay momentum sırası; fiyat 200 günlük ortalamanın üstünde',
                      'fit': "Portföyle 1 yıllık günlük getiri korelasyonu (portföydeki enstrümanların eşit ağırlıklı yaklaşığı); çeşitlendirici < 0,5"},
           'lists': {}, 'backtest': {}, 'universe': {'stock': len([t for t in stocks if t in px]), 'etf': len([t for t in etfs if t in px])}}
    cons, hcard = house_layer(HV, dates, px, i)
    out['houses'] = {'consensus': cons, 'card': hcard, 'updatedAt': HV.get('updatedAt')}
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
            ths = [ETF_THEME[t]] if kind == 'etf' and t in ETF_THEME else (stock_themes(u) if kind == 'stock' else [])
            hv = [{'th': th, 'n': cons[th]['n'], 'score': cons[th]['score'], 'pos': [x['h'] for x in cons[th]['pos'] if not x['stale']],
                   'neg': [x['h'] for x in cons[th]['neg'] if not x['stale']]} for th in ths if th in cons]
            info = ETF_INFO.get(t) if kind == 'etf' else None
            rows.append({'t': t, 'n': u.get('n') or ETFS.get(t) or t, 'sec': u.get('sec') or ('ETF' if kind == 'etf' else None), 'ind': u.get('ind'),
                         'issuer': info[1] if info else None, 'basis': info[2] if info else None, 'hv': hv,
                         'news': news_for(t, u.get('n') or ETFS.get(t), NR, KH, by_name=(kind == 'stock')) if len(rows) < 12 else [],
                         'score': round(s * 100, 1), 'rank': rk[t], 'of': nrank, 'mom': round(M[t] * 100, 1), 'vol': round(V[t] * 100, 1) if V.get(t) else None,
                         'trend': round(T[t] * 100, 1), 'corr': None if c is None else round(c, 2), 'px': round(px[t][i], 4),
                         'pe': u.get('pe'), 'beta': u.get('beta'), 'mc': u.get('mc'),
                         'held': t in port, 'inFunds': held_funds_holdings.get(t, []), 'new': t not in prev_top.get(kind, set())})
        def dup_ok(r, chosen):
            g = next((g for g in DUP if r['t'] in g), None)
            return not g or not any(c['t'] in g for c in chosen)
        notheld = []
        for r in rows:
            if not r['held'] and dup_ok(r, notheld) and not any(r['t'] in g and set(port) & g for g in DUP):
                notheld.append(r)
        guclu = [dict(r, list='guclu') for r in notheld[:5]]
        cesit = [dict(r, list='cesit') for r in notheld if r['corr'] is not None and r['corr'] < 0.5 and r['t'] not in {g['t'] for g in guclu}][:3]
        out['lists'][kind] = {'guclu': guclu, 'cesit': cesit, 'all': rows[:30]}
        today_for_log[kind] = guclu[:3] + cesit[:2]
        if '--no-backtest' not in sys.argv:
            try:
                out['backtest'][kind] = backtest(kind, names, dates, px)
                if kind == 'stock':  # ayrıştırma: hangi etken ne katkı yaptı (yöntem değiştirilmez; yalnızca bilgi)
                    out['backtest']['stockParts'] = {}
                    for lab, a, b in (('eskiBilesik', 0.6, 0.4), ('dusukOynaklik', 0.0, 1.0)):
                        r = backtest(kind, names, dates, px, a, b)
                        if r:
                            out['backtest']['stockParts'][lab] = {k: r[k] for k in ('cagr', 'cagrEW', 'mdd', 't', 'hitMonths')}
            except Exception as e:
                DIAG['errors'][f'backtest:{kind}'] = f'{type(e).__name__}: {str(e)[:100]}'
    if not out['backtest'] and prev.get('backtest'):
        out['backtest'] = prev['backtest']
    log = rd('ideas_log.json', None) or {'events': []}
    for e in log['events']:
        e.setdefault('v', 1)
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
                      'test': {k: {kk: v.get(kk) for kk in ('from', 'cagr', 'cagrEW', 'cagrSPY', 'mdd', 'mddEW', 't', 'hitMonths')} for k, v in bt.items() if v and k in ('stock', 'etf')}, 'parcalar': bt.get('stockParts'),
                      **DIAG}, ensure_ascii=False)[:3000])


if __name__ == '__main__':
    main()
