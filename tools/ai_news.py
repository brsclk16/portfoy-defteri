#!/usr/bin/env python3
"""Günlük haber özeti — Claude görevinin haber adımının yerine, ücretsiz.
Sıra: (1) AI_API_URL/AI_API_KEY ile herhangi bir OpenAI uyumlu sağlayıcı, (2) GEMINI_API_KEY, (2b) GROQ_API_KEY, (3) GitHub Models (GITHUB_TOKEN);
hiçbiri çalışmazsa (4) anahtarsız kural tabanlı seçim + ücretsiz Google Çeviri (başlık/özet Türkçeye çevrilir, "neden önemli" fon ağırlıklarından yazılır).

Girdi : data/news_raw.json (Haber toplayıcı), data/portfolio.json (enstrümanlar ve holdingler, mevcut haberler)
Çıktı : data/news_ai.json {"updatedAt","model","items":[haber dokümanı, ...]} ve data/portfolio.json → news (url'ye göre tekilleştirilerek)
Kural : Model yalnızca verilen başlık/özetlerden seçer ve Türkçe yazar; url, kaynak ve tarih ham maddeden alınır (model uyduramaz);
        ticker'lar portföy listesiyle süzülür. Model hata verirse hiçbir dosya değişmez.
Kullanım: python3 tools/ai_news.py [--dry] [--hours 26]"""
import datetime as dt, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx

TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
MODELS = [m for m in os.environ.get('AI_MODELS', 'openai/gpt-4.1-mini').split(',') if m]
URL = 'https://models.github.ai/inference/chat/completions'
DRY = '--dry' in sys.argv
HOURS = int(sys.argv[sys.argv.index('--hours') + 1]) if '--hours' in sys.argv else 26
NOW = dt.datetime.now(dt.timezone.utc)
STAMP = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
MAX_IN = 60

SYSTEM = """Sen bir Türk yatırımcının portföy sitesi için haber editörüsün. Sana numaralı İngilizce/Türkçe haber başlıkları ve kısa özetler,
ayrıca portföydeki fonlar/hisseler ve fonların büyük holdingleri verilecek.
Görev: portföyü GERÇEKTEN ilgilendiren 3-12 haberi seç (yoksa boş liste). Aynı olayı anlatan maddelerden yalnızca birini seç.
Fiyat tahmini, 'en iyi hisseler' listeleri, ürün indirimi/tanıtımı, kripto ve tekrarlayan önemsiz haberleri ATLA.
Her seçilen haber için YALNIZCA verilen metindeki bilgiyi kullan; rakam, isim ya da olay UYDURMA. Kaynak cümlesini kopyalama, Türkçe kendi cümlenle yaz.
Sadece başlığı olan maddede özeti başlığın ötesine taşıma.
YALNIZCA şu JSON'u döndür (başka metin yok):
{"items":[{"i":<madde numarası>,"title":"Türkçe başlık (~90 karakter)","summary":"Türkçe 2-3 cümle","whyItMatters":"Türkçe 1-2 cümle: hangi fonu/hisseyi nasıl etkiler",
"tickers":["etkilenen portföy fon/hisse ticker'ları — yalnızca verilen PORTFÖY listesinden"],"holdings":["ilgili şirket ticker'ları"],
"impact":"olumlu|olumsuz|nötr|karisik","importance":1|2|3}]}
importance: 1 bilgi, 2 izlenmeli, 3 fiyatı belirgin etkileyebilir."""


def slug(s):
    s = s.translate(str.maketrans('ıİşŞçÇğĞöÖüÜ', 'iIsScCgGoOuU'))
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:48] or 'haber'


def ts(s):
    try:
        return dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except Exception:
        return None


class _KeepPost(urllib.request.HTTPRedirectHandler):
    """Yönlendirmede POST gövdesini ve başlıkları koru (urllib varsayılanı GET'e çevirir)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        print(f'yönlendirme {code} → {newurl}')
        return urllib.request.Request(newurl, data=req.data, headers=dict(req.header_items()), method='POST')


OPENER = urllib.request.build_opener(_KeepPost)


GEMINI = os.environ.get('GEMINI_API_KEY', '').strip()
GROQ = (os.environ.get('GROQ_API_KEY') or os.environ.get('GROQ_KEY') or '').strip()
EXT_URL, EXT_KEY = os.environ.get('AI_API_URL', '').strip(), os.environ.get('AI_API_KEY', '').strip()  # herhangi bir OpenAI uyumlu sağlayıcı (isteğe bağlı)
ENDPOINTS = ([(EXT_URL, {'Accept': 'application/json', '_key': EXT_KEY})] if EXT_URL and EXT_KEY else []) + \
    ([('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {'Accept': 'application/json', '_key': GEMINI})] if GEMINI else []) + \
    ([('https://api.groq.com/openai/v1/chat/completions', {'Accept': 'application/json', '_key': GROQ})] if GROQ else []) + [
    ('https://models.github.ai/inference/chat/completions', {'Accept': 'application/json'}),
    ('https://models.github.ai/inference/chat/completions', {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}),
    ('https://models.inference.ai.azure.com/chat/completions', {'Accept': 'application/json'}),
]
_GOOD = []


def _post(url, extra, body):
    extra = dict(extra)
    key = extra.pop('_key', None) or TOKEN
    h = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'User-Agent': 'portfoy-defteri-ai-news'}
    h.update(extra)
    req = urllib.request.Request(url, data=body, headers=h, method='POST')
    try:
        with OPENER.open(req, timeout=120) as r:
            raw, st, ct = r.read().decode('utf-8', 'replace'), r.status, r.headers.get('Content-Type')
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{url} HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}')
    try:
        return json.loads(raw)
    except Exception:
        raise RuntimeError(f'{url} HTTP {st} ({ct}), JSON değil: {raw[:200]!r}')


_USED = []
GROQ_MODELS = [m for m in os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b').split(',') if m]
GEMINI_MODELS = [m for m in os.environ.get('GEMINI_MODEL', 'gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest').split(',') if m]


def ask(model, user):
    errs = []
    for url, extra in _GOOD + [e for e in ENDPOINTS if e not in _GOOD]:
        if url == EXT_URL:
            names = [os.environ.get('AI_MODEL') or model]
        elif 'googleapis' in url:
            names = GEMINI_MODELS
        elif 'groq' in url:
            names = GROQ_MODELS
        else:
            names = [model.split('/')[-1] if 'azure' in url else model]
        j = None
        for mdl in names:
            b = {'model': mdl, 'temperature': 0.2, 'max_tokens': 3500,
                 'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user if 'groq' not in url else user[:14000]}]}
            if 'groq' in url and mdl.startswith('openai/gpt-oss'):
                b['reasoning_effort'] = 'low'
            body = json.dumps(b).encode()
            for attempt in range(3):
                try:
                    j = _post(url, extra, body)
                    break
                except Exception as e:
                    msg = str(e)
                    errs.append(f'{mdl}: {msg[:300]}')
                    if ('HTTP 503' in msg or 'HTTP 429' in msg) and attempt < 2:
                        time.sleep(20 * (attempt + 1))
                        continue
                    break
            if j is not None:
                print(f'uç nokta: {url} · model: {mdl}')
                _USED[:] = [mdl]
                break
        if j is not None:
            if not _GOOD:
                _GOOD.append((url, extra))
            break
    else:
        raise RuntimeError(' | '.join(errs))
    txt = j['choices'][0]['message']['content']
    m = re.search(r'\{.*\}', txt, re.S)
    return json.loads(m.group(0))


JUNK = re.compile(r'(price prediction|forecast 20\d\d|top \d+ stocks|best stocks?|should you buy|buy now|is it too late|motley fool|'
                  r'stocks? to (buy|watch)|millionaire|dividend stocks?|crypto|bitcoin|\bdeal(s)?\b.*%|discount|coupon|review:|'
                  r'buying opportunity|massive news|skyrocket|soar(s|ing)?\b|\?\s*$)', re.I)
HIGH = re.compile(r'(8-K|6-K|earnings|results|guidance|outlook|FDA|approval|approves|phase 3|acquir|merger|buyback|downgrade|upgrade|'
                  r'export|tariff|ban|lawsuit|recall|CEO|resign|beats|misses|raises|cuts|record)', re.I)


def tr(text):
    """Ücretsiz Google Çeviri uç noktası (anahtarsız). Hata olursa metni olduğu gibi döndürür."""
    text = (text or '').strip()
    if not text:
        return text
    try:
        u = ('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q='
             + urllib.parse.quote(text[:1500]))
        j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read().decode())
        out = ''.join(seg[0] for seg in j[0] if seg and seg[0])
        time.sleep(0.4)
        return out or text
    except Exception:
        return text


def _words(t):
    return {w for w in re.findall(r'[a-z0-9]{4,}', (t or '').lower())}


def rule_select(cand, I, hold, k=8):
    """Model yokken: portföy ilişkisi, kaynak türü ve önem kelimelerine göre puanla; benzer başlıkları ele; Türkçeye çevir."""
    picked, bags = [], []
    scored = []
    for i, (sc, p, it, rel) in enumerate(cand):
        title = it.get('title') or ''
        if JUNK.search(title) or not rel:
            continue
        direct = [t for t in rel if t in I]
        s2 = sc + (3 if direct else 0) + (2 if HIGH.search(title + ' ' + (it.get('summary') or '')) else 0) \
            + (2 if it.get('feed') == 'sec' or (it.get('source') or '').upper().startswith('SEC') else 0)
        scored.append((s2, p, i, it, rel, direct))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    for s2, p, i, it, rel, direct in scored:
        wb = _words(it.get('title'))
        if any(len(wb & b) >= max(3, int(0.5 * min(len(wb), len(b)))) for b in bags):
            continue
        bags.append(wb)
        why = []
        for h in rel[:3]:
            if h in I:
                why.append(f'{h} portföyde doğrudan pozisyon.')
            for v in hold.get(h, [])[:2]:
                f, w = v.split(' ')[0], v.split(' ')[1] if ' ' in v else ''
                why.append(f'{h}, {f} fonunda {w} ağırlıkta.')
        summ = (it.get('summary') or '').strip()
        picked.append({'i': i, 'title': tr(it['title'])[:140], 'summary': tr(summ[:600]) if summ else '',
                       'whyItMatters': ' '.join(dict.fromkeys(why))[:400],
                       'tickers': direct or sorted({v.split(' ')[0] for h in rel for v in hold.get(h, [])}),
                       'holdings': rel[:8], 'impact': 'nötr', 'importance': 2 if (direct or s2 >= 7) else 1})
        if len(picked) >= k:
            break
    return {'items': picked}


def main():
    P = fx.rd('portfolio.json', {}) or {}
    I = P.get('instruments') or {}
    port = sorted(I)
    hold = {}
    for t, i in I.items():
        for h in (i.get('holdings') or [])[:8]:
            if h.get('t'):
                hold.setdefault(h['t'], []).append(f"{t} %{h.get('w')}")
    allowed_h = set(hold) | set(port)
    raw = fx.rd('news_raw.json', {}) or {}
    A = fx.rd('news_ai.json', {}) or {'items': []}
    seen = {n.get('url') for n in (P.get('news') or [])} | {n.get('url') for n in A.get('items', [])}
    seen_t = {slug(n.get('title', ''))[:30] for n in (P.get('news') or []) + A.get('items', [])}
    cut = NOW - dt.timedelta(hours=HOURS)
    cand = []
    for it in raw.get('items') or []:
        p = ts(it.get('publishedAt'))
        if not p or p < cut or it.get('url') in seen or not it.get('title'):
            continue
        rel = [t for t in (it.get('tickers') or []) if t in allowed_h]
        score = (2 if rel else 0) + (1 if it.get('summary') else 0) + (1 if it.get('feed') not in ('google',) else 0) + (1 if it.get('themes') else 0)
        cand.append((score, p, it, rel))
    cand.sort(key=lambda x: (x[0], x[1]), reverse=True)
    cand = cand[:MAX_IN]
    if not cand:
        print('yeni aday haber yok')
        return
    lines = [f"PORTFÖY: {', '.join(f"{t} ({I[t].get('type')})" for t in port)}",
             'FON HOLDİNGLERİ: ' + '; '.join(f'{h}: {", ".join(v)}' for h, v in sorted(hold.items())[:80]), '', 'HABERLER:']
    for k, (_, p, it, rel) in enumerate(cand):
        s = (it.get('summary') or '').replace('\n', ' ')[:220]
        lines.append(f"[{k}] {p.strftime('%m-%d %H:%M')} | {it.get('source', '')[:30]} | {','.join(rel or it.get('tickers') or [])[:40]} | {it['title'][:160]}"
                     + (f' — {s}' if s else ''))
    user = '\n'.join(lines)
    out, used, err = None, None, []
    for m in MODELS:
        try:
            out = ask(m, user)
            used = (_USED or [m])[0]
            break
        except Exception as e:
            err.append(f'{m}: {type(e).__name__} {str(e)[:1500]}')
            time.sleep(3)
    if out is None:
        print(json.dumps({'model_hatalari': [e[:300] for e in err]}, ensure_ascii=False))
        out, used = rule_select(cand, I, hold), 'kural tabanlı seçim + Google Çeviri'
    new = []
    for x in out.get('items') or []:
        try:
            _, p, it, rel = cand[int(x.get('i'))]
        except Exception:
            continue
        title = str(x.get('title') or '').strip()
        if not title or slug(title)[:30] in seen_t:
            continue
        tick = [t for t in (x.get('tickers') or []) if t in I] or [t for t in rel if t in I]
        if not tick:
            tick = sorted({v.split(' ')[0] for h in rel for v in hold.get(h, [])})
        if not tick:
            continue
        imp = x.get('impact') if x.get('impact') in ('olumlu', 'olumsuz', 'nötr', 'karisik') else 'nötr'
        try:
            importance = max(1, min(3, int(x.get('importance') or 1)))
        except Exception:
            importance = 1
        doc = {'id': f"{p.strftime('%Y%m%d')}-{slug(title)}", 'title': title[:140], 'summary': str(x.get('summary') or '')[:700],
               'whyItMatters': str(x.get('whyItMatters') or '')[:400], 'tickers': tick,
               'holdings': [h for h in (x.get('holdings') or []) if h in allowed_h][:8], 'impact': imp, 'importance': importance,
               'source': it.get('source') or '', 'url': it['url'], 'publishedAt': p.strftime('%Y-%m-%dT%H:%M:%SZ'), 'fetchedAt': STAMP,
               'ai': used if used.startswith('kural') else (('Gemini' if used.startswith('gemini') else 'Groq' if used in GROQ_MODELS else 'Yapay zekâ') + f' · {used}')}
        new.append(doc)
        seen_t.add(slug(title)[:30])
    print(json.dumps({'model': used, 'adaylar': len(cand), 'secilen': len(new), 'errs': err,
                      'ornek': [{k: d[k] for k in ('title', 'tickers', 'importance')} for d in new[:6]]}, ensure_ascii=False, indent=1))
    if DRY or not new:
        return
    keep = NOW - dt.timedelta(days=45)
    items = new + [d for d in A.get('items', []) if (ts(d.get('publishedAt')) or NOW) >= keep]
    fx.wr('news_ai.json', {'updatedAt': STAMP, 'model': used, 'items': items[:150]})
    urls = {n.get('url') for n in P.get('news') or []}
    P['news'] = sorted((P.get('news') or []) + [d for d in new if d['url'] not in urls], key=lambda n: n.get('publishedAt', ''), reverse=True)[:80]
    fx.wr('portfolio.json', P)


if __name__ == '__main__':
    main()
