#!/usr/bin/env python3
"""Gemini ile metin işleri (GitHub Actions; Claude görevlerinin yerine).

  python3 tools/ai_tasks.py qa      [--dry]   data/q/*.json sorularını cevaplar → data/answers.json (soru dosyası silinir)
  python3 tools/ai_tasks.py brief   [--dry]   sabah brifingi → data/brief.json
  python3 tools/ai_tasks.py weekly  [--dry]   haftalık değerlendirme → data/weekly.json (getiriler Python ile hesaplanır)
Her iş Telegram'a kısa özet gönderir (TG_TOKEN/TG_CHAT varsa). Rakamlar verilen veriden; model yalnızca yorum/metin yazar.
Gemini başarısız olursa dosyalar değişmez (Claude görevleri yedek olarak işi yapar)."""
import datetime as dt, glob, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx
import gemini

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = '--dry' in sys.argv
NOW = dt.datetime.now(dt.timezone.utc)
STAMP = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
TRT = dt.timezone(dt.timedelta(hours=3))
AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
SITE = 'https://brsclk16.github.io/portfoy-defteri/'
TONE = ('Türkçe yaz; sade, net, samimi ama profesyonel. Yatırım tavsiyesi verme ("al/sat" deme), durumu ve seçenekleri anlat. '
        'Rakamları YALNIZCA verilen veriden al, uydurma; emin olmadığın şeyi yazma. Kaynaklardan cümle kopyalama.')


def tg(text):
    if DRY:
        print('--- telegram ---\n' + text)
        return
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'tg.py'), text], check=False)


def ts(s):
    try:
        return dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except Exception:
        return None


def summary():
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'check_alerts.mjs'), '--summary', '--dry'], capture_output=True, text=True, cwd=ROOT)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {}


def portfolio():
    return fx.rd('portfolio.json', {}) or {}


def upcoming(days):
    """Önümüzdeki olaylar: econ.json (imp≥2), earnhist next, portfolio events."""
    end = NOW + dt.timedelta(days=days)
    out = []
    for e in (fx.rd('econ.json', {}) or {}).get('events', []):
        d = ts(e.get('date'))
        if d and NOW - dt.timedelta(hours=2) <= d <= end and (e.get('imp') or 0) >= 2:
            out.append({'_d': d, 'tarih_trt': d.astimezone(TRT).strftime('%d.%m %H:%M'), 'ulke': e.get('c'), 'olay': e.get('tr') or e.get('name'),
                        'beklenti': e.get('fc'), 'onceki': e.get('prev'), 'birim': e.get('unit'), 'onem': e.get('imp')})
    for t, v in ((fx.rd('earnhist.json', {}) or {}).get('data') or {}).items():
        n = v.get('next') or {}
        d = ts(n.get('dt'))
        if d and NOW <= d <= end:
            m = [abs(h['move']) for h in v.get('hist', [])[:8] if h.get('move') is not None]
            out.append({'_d': d, 'tarih_trt': d.astimezone(TRT).strftime('%d.%m %H:%M'), 'olay': f'{v.get("name") or t} bilançosu ({n.get("q")})',
                        'sembol': t, 'tipik_hareket_%': round(sum(m) / len(m), 1) if m else None})
    for e in portfolio().get('events', []):
        d = ts(e.get('date'))
        if d and NOW <= d <= end:
            out.append({'_d': d, 'tarih_trt': d.astimezone(TRT).strftime('%d.%m %H:%M'), 'olay': e.get('title'), 'ilgili': e.get('tickers'), 'not': e.get('note')})
    seen, res = set(), []
    for e in sorted(out, key=lambda x: x['_d']):
        e.pop('_d')
        k = (e['tarih_trt'][:5], str(e.get('olay'))[:25])
        if k not in seen:
            seen.add(k)
            res.append(e)
    return res[:25]


def news(hours, k=25):
    cut = NOW - dt.timedelta(hours=hours)
    out = []
    for n in portfolio().get('news', []):
        if (ts(n.get('publishedAt')) or cut) >= cut:
            out.append({'baslik': n.get('title'), 'ozet': (n.get('summary') or '')[:300], 'neden': (n.get('whyItMatters') or '')[:200],
                        'ilgili': n.get('tickers'), 'onem': n.get('importance'), 'url': n.get('url')})
    return sorted(out, key=lambda x: -(x.get('onem') or 0))[:k]


def markets():
    s = (fx.rd('markets.json', {}) or {}).get('series', {})
    m = (fx.rd('mstrip.json', {}) or {}).get('quotes', {})
    out = {k: v[-1] for k, v in s.items() if v}
    out.update({f'şerit_{k}': {'fiyat': v.get('px'), 'gunluk_%': v.get('pct'), 'tarih': v.get('d')} for k, v in m.items()})
    return out


# ------------------------------------------------------------------ soru-cevap
def qa():
    files = sorted(glob.glob(os.path.join(ROOT, 'data', 'q', '*.json')))
    files = [f for f in files if not f.endswith('.gitkeep')][:5]
    if not files:
        print('bekleyen soru yok')
        return
    P = portfolio()
    S = summary()
    A = fx.rd('answers.json', {}) or {'items': []}
    A.setdefault('items', [])
    msgs = []
    for f in files:
        q = json.load(open(f))
        t = q.get('t') or ''
        ctx = {'portfoy': {k: {'tur': v.get('type'), 'izleme': bool(v.get('watchlist')), 'fiyat': v.get('price')} for k, v in P.get('instruments', {}).items()},
               'teknik_planlar': [p for p in S.get('plans', []) if not t or p.get('t') == t][:15],
               'son_haberler': news(72, 12)}
        if t:
            inst = P.get('instruments', {}).get(t, {})
            ctx['enstruman'] = {k: inst.get(k) for k in ('name', 'type', 'price', 'priceAsOf', 'high52', 'low52', 'metrics', 'summary', 'strengths', 'risks', 'holdings')}
            ctx['sinyal'] = (P.get('signals') or {}).get(t)
            ctx['degerleme'] = ((fx.rd('valuation.json', {}) or {}).get('data') or {}).get(t)
            ctx['analist'] = (((fx.rd('analysts.json', {}) or {}).get('data') or {}).get(t) or {}).get('hist', [])[-3:]
            ctx['bilanco'] = ((fx.rd('earnhist.json', {}) or {}).get('data') or {}).get(t)
        system = (f'Barış\'ın kişisel portföy sitesindeki asistansın. {TONE} Verilen site verisini kullan; güncel bilgi gerekiyorsa Google Arama ile doğrula. '
                  'Kişisel pozisyon verisine erişimin yok; soruda kişisel tutar varsa genel ilkelerle cevapla. '
                  'Cevabı 2-5 kısa paragraf olarak yaz (paragrafları boş satırla ayır), somut rakam ve izlenecek seviyelerle; '
                  'son cümle tam olarak: "Bu bir değerlendirmedir, yatırım tavsiyesi değildir."')
        user = f'SORU ({t or "genel portföy"}): {q.get("q")}\n\nSİTE VERİSİ (JSON):\n{json.dumps(ctx, ensure_ascii=False, default=str)[:24000]}'
        try:
            ans, src = gemini.ask(system, user, search=True, as_json=False, max_tokens=3000)
        except Exception as e:
            print(f'{os.path.basename(f)}: Gemini hata — {e}')
            continue
        ans = ans.strip()
        if 'yatırım tavsiyesi değildir' not in ans:
            ans += '\n\nBu bir değerlendirmedir, yatırım tavsiyesi değildir.'
        item = {'id': q.get('id') or os.path.basename(f)[:-5], 't': t, 'q': q.get('q'), 'a': ans, 'createdAt': q.get('createdAt'),
                'answeredAt': STAMP, 'sources': src[:6], 'ai': gemini.label()}
        A['items'] = [item] + [x for x in A['items'] if x.get('id') != item['id']][:99]
        first = ans.split('\n')[0][:220]
        msgs.append(f'💬 {(q.get("q") or "")[:80]}\n{first}\n{SITE}#/' + (f't/{t}' if t else 'analiz/asistan'))
        print(json.dumps(item, ensure_ascii=False)[:1200])
        if not DRY:
            os.remove(f)
    if msgs and not DRY:
        A['updatedAt'] = STAMP
        fx.wr('answers.json', A)
    if msgs:
        tg('\n\n'.join(msgs))


# ------------------------------------------------------------------ sabah brifingi
def brief():
    S = summary()
    ctx = {'asOf': S.get('asOf'), 'hareketler': S.get('movers'), 'teknik_planlar': S.get('plans'), 'alarmlar': S.get('messages'),
           'yaklasan_olaylar_48s': upcoming(2), 'son_24s_haberler': news(30, 15), 'piyasa': markets()}
    system = (f'Barış\'ın portföyü için kısa SABAH BRİFİNGİ yazıyorsun. {TONE} '
              'YALNIZCA şu JSON\'u döndür: {"title":"~70 karakterlik günün ana mesajı","sections":['
              '{"h":"Dün","items":[2-4 madde: en iyi/en kötü hareketler rakamlarla, S&P 500 (SPY) kıyası]},'
              '{"h":"Bugün","items":[2-4 madde: bugün/yarın olaylar TRT saatiyle ve hangi pozisyonları neden ilgilendirdiği]},'
              '{"h":"Teknik durum","items":[2-4 madde: alım bölgesinde, aşırı ısınmış ya da stop\'a %3\'ten yakın enstrümanlar, seviyeleriyle]}]}')
    out, _ = gemini.ask(system, json.dumps(ctx, ensure_ascii=False, default=str)[:30000], as_json=True, max_tokens=2500)
    secs = [{'h': s.get('h'), 'items': [str(i) for i in (s.get('items') or [])][:4]} for s in (out.get('sections') or []) if s.get('h')]
    if not out.get('title') or not secs:
        raise RuntimeError(f'eksik yanıt: {out}')
    B = {'publishedAt': STAMP, 'asOf': S.get('asOf'), 'title': str(out['title'])[:120], 'sections': secs,
         'ai': gemini.label()}
    print(json.dumps(B, ensure_ascii=False, indent=1))
    if not DRY:
        fx.wr('brief.json', B)
    lines = ['☀️ ' + B['title']]
    for s in secs:
        lines.append(f'\n{s["h"]}')
        lines += [f'• {i}' for i in s['items']]
    if S.get('asOf') and (NOW.date() - dt.date.fromisoformat(S['asOf'])).days > 3:
        lines.append(f'\n(Fiyatlar {S["asOf"]} tarihli.)')
    lines.append('\n' + SITE)
    tg('\n'.join(lines))


# ------------------------------------------------------------------ haftalık
def weekly():
    H = fx.rd('history.json', {}) or {}
    P = portfolio()
    I = P.get('instruments', {})
    today = NOW.astimezone(TRT).date()
    fri = today - dt.timedelta(days=(today.weekday() - 4) % 7)          # bu haftanın (ya da son) cuması
    prev_fri = fri - dt.timedelta(days=7)

    def last_on_or_before(series, d):
        v = [x for x in series if x[0] <= d.isoformat()]
        return v[-1] if v else None

    def ret(t):
        s = H.get(t) or []
        a, b = last_on_or_before(s, fri), last_on_or_before(s, prev_fri)
        if not a or not b or a[0] <= b[0] or not b[1]:
            return None
        return round((a[1] / b[1] - 1) * 100, 2)

    movers = sorted([{'t': t, 'pct': ret(t)} for t, v in I.items() if not v.get('watchlist') and ret(t) is not None], key=lambda x: -x['pct'])
    watch = [{'t': t, 'pct': ret(t)} for t, v in I.items() if v.get('watchlist') and ret(t) is not None]
    bench = {k: ret(k) for k in ('SPY', 'USDTRY', 'XAUUSD')}
    if not movers:
        raise RuntimeError('haftalık getiri hesaplanamadı')
    iso = fri.isocalendar()
    rid = f'{iso[0]}-W{iso[1]:02d}'
    mon = fri - dt.timedelta(days=4)
    rng = (f'{mon.day}–{fri.day} {AYLAR[fri.month - 1]} {fri.year}' if mon.month == fri.month
           else f'{mon.day} {AYLAR[mon.month - 1]}–{fri.day} {AYLAR[fri.month - 1]} {fri.year}')
    W = fx.rd('weekly.json', {}) or {'reports': []}
    ctx = {'hafta': rng, 'portfoy_getirileri_%': movers, 'izleme_listesi_%': watch, 'kiyas_%': bench,
           'temalar': {t: v.get('theme') or v.get('type') for t, v in I.items() if not v.get('watchlist')},
           'haftanin_haberleri': news(24 * 7, 30), 'gelecek_hafta': upcoming(9),
           'onceki_rapor_basligi': (W.get('reports') or [{}])[0].get('title')}
    system = (f'Barış\'ın portföyü için HAFTALIK DEĞERLENDİRME yazıyorsun. {TONE} Gerekirse haftanın önemli piyasa gelişmelerini Google Arama ile doğrula. '
              'YALNIZCA şu JSON\'u döndür: {"title":"~60 karakterlik başlık","summary":[3 paragraf: (1) haftanın genel resmi, en iyi/en kötü ve S&P 500 kıyası; '
              '(2) temaların (yarı iletken, AI altyapı, biyotek, değerli metal, bakır) nedenleriyle durumu; (3) dolar/TL ve TL bazında etki, çeşitlendirmenin nasıl çalıştığı],'
              '"highlights":[4-6 madde: önemli şirket/fon gelişmeleri, rakamlarla],"nextWeek":[3-6 madde: tarih, olay ve hangi pozisyonları neden ilgilendirdiği],'
              '"watch":[2-4 madde: dikkat edilmesi gereken riskler; izleme listesinde dikkat çeken varsa ekle]}')
    out, src = gemini.ask(system, json.dumps(ctx, ensure_ascii=False, default=str)[:32000], search=True, as_json=True, max_tokens=5000)
    rep = {'id': rid, 'weekEnd': fri.isoformat(), 'range': rng, 'publishedAt': STAMP, 'title': str(out.get('title') or '')[:120], 'movers': movers,
           'summary': [str(x) for x in out.get('summary') or []][:3], 'highlights': [str(x) for x in out.get('highlights') or []][:6],
           'nextWeek': [str(x) for x in out.get('nextWeek') or []][:6], 'watch': [str(x) for x in out.get('watch') or []][:4],
           'ai': gemini.label()}
    if src:
        rep['sources'] = src[:8]
    if not rep['title'] or len(rep['summary']) < 2:
        raise RuntimeError(f'eksik yanıt: {out}')
    print(json.dumps(rep, ensure_ascii=False, indent=1)[:4000])
    if not DRY:
        W['reports'] = [rep] + [r for r in W.get('reports', []) if r.get('id') != rid][:25]
        fx.wr('weekly.json', W)
    best, worst = movers[0], movers[-1]
    tg(f'📊 Haftalık değerlendirme ({rng})\n{rep["title"]}\nEn iyi: {best["t"]} %{best["pct"]:+.2f} · En zayıf: {worst["t"]} %{worst["pct"]:+.2f}'
       + (f' · S&P 500: %{bench["SPY"]:+.2f}' if bench.get('SPY') is not None else '')
       + (f'\nGelecek hafta: {rep["nextWeek"][0]}' if rep['nextWeek'] else '') + f'\n{SITE}')


if __name__ == '__main__':
    job = next((a for a in sys.argv[1:] if not a.startswith('--')), '')
    if not gemini.available():
        sys.exit('GEMINI_API_KEY / GROQ_API_KEY yok')
    {'qa': qa, 'brief': brief, 'weekly': weekly}[job]()
