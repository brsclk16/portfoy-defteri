#!/usr/bin/env python3
"""Günlük haber özeti — ücretsiz model: Google Gemini (GEMINI_API_KEY secret'ı varsa) ya da GitHub Models (GITHUB_TOKEN) — Claude görevinin haber adımının yerine.

Girdi : data/news_raw.json (Haber toplayıcı), data/portfolio.json (enstrümanlar ve holdingler, mevcut haberler)
Çıktı : data/news_ai.json {"updatedAt","model","items":[haber dokümanı, ...]} ve data/portfolio.json → news (url'ye göre tekilleştirilerek)
Kural : Model yalnızca verilen başlık/özetlerden seçer ve Türkçe yazar; url, kaynak ve tarih ham maddeden alınır (model uyduramaz);
        ticker'lar portföy listesiyle süzülür. Model hata verirse hiçbir dosya değişmez.
Kullanım: python3 tools/ai_news.py [--dry] [--hours 26]"""
import datetime as dt, json, os, re, sys, time, unicodedata, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx

TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
MODELS = [m for m in os.environ.get('AI_MODELS', 'openai/gpt-4.1-mini,openai/gpt-4o-mini').split(',') if m]
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
ENDPOINTS = ([('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {'Accept': 'application/json', '_key': GEMINI})] if GEMINI else []) + [
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


def ask(model, user):
    errs = []
    for url, extra in (_GOOD or ENDPOINTS):
        mdl = (os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash') if 'googleapis' in url
               else model.split('/')[-1] if 'azure' in url else model)
        body = json.dumps({'model': mdl, 'temperature': 0.2, 'max_tokens': 3500,
                           'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]}).encode()
        try:
            j = _post(url, extra, body)
            if not _GOOD:
                _GOOD.append((url, extra))
            print(f'uç nokta: {url}')
            break
        except Exception as e:
            errs.append(str(e)[:400])
    else:
        raise RuntimeError(' | '.join(errs))
    txt = j['choices'][0]['message']['content']
    m = re.search(r'\{.*\}', txt, re.S)
    return json.loads(m.group(0))


def main():
    if not (TOKEN or GEMINI):
        sys.exit('GITHUB_TOKEN/GEMINI_API_KEY yok')
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
            used = m
            break
        except Exception as e:
            err.append(f'{m}: {type(e).__name__} {str(e)[:1500]}')
            time.sleep(3)
    if out is None:
        print(json.dumps({'errs': err}, ensure_ascii=False))
        sys.exit(1)
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
               'ai': ('Gemini' if _GOOD and 'googleapis' in _GOOD[0][0] else 'GitHub Models') + f' · {used}'}
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
