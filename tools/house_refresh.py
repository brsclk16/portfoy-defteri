#!/usr/bin/env python3
"""Büyük yöneticilerin görünümlerini otomatik günceller → data/house_views.json (GitHub Actions'ta, ücretsiz model).

Her kurum için sırayla:
  1) Sabit kaynak sayfası/PDF'i (feeds) çekilir; metin ücretsiz modele (Gemini → GitHub Models) verilir ve YALNIZCA o metinden
     tema bazında duruş çıkarılır. Kaynak = çekilen adres.
  2) Sayfa çekilemezse ya da görüş içermiyorsa: Gemini'nin Google araması (grounding) ile kurumun en son görünümü bulunur;
     kaynak bağlantıları modelin yazdığı değil, aramanın döndürdüğü gerçek sonuçlardır (groundingMetadata).
Doğrulama: yayın tarihi okunabilir, mevcut kayıttan yeni ve son 9 ay içinde; temalar bilinen anahtarlar; duruş -1/0/1; en az bir görüş.
Güncellenen kurumun önceki görüşü 'history'ye taşınır (karne birikmeye devam eder). Hiçbir şey çalışmazsa dosya değişmez.
Kullanım: python3 tools/house_refresh.py [--only blackrock,vanguard] [--dry]"""
import datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai_news as AI  # ücretsiz model uç noktaları (Gemini, GitHub Models) ve JSON ayrıştırma

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
P = os.path.join(DATA, 'house_views.json')
TODAY = dt.date.today()
DRY = '--dry' in sys.argv
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
GEMINI = os.environ.get('GEMINI_API_KEY', '').strip()
T0 = time.time()
BUDGET = 13 * 60  # saniye: süre dolunca kalan kurumlar bir sonraki çalışmaya kalır, yapılanlar her durumda kaydedilir
SYS = 'Sen titiz bir finans analistisin. Yalnızca verilen metinde açıkça yazanı yapılandırırsın; uydurmazsın. Yalnızca JSON döndürürsün.'


def left():
    return BUDGET - (time.time() - T0)
TTL = {'blackrock': 92, 'vanguard': 183, 'jpmorgan': 365, 'goldman': 365, 'statestreet': 183, 'pimco': 183, 'amundi': 365,
       'capitalgroup': 365, 'fidelity': 92, 'bny': 62}
MON = ['jan', 'feb', 'mar', 'apr', 'may', 'june', 'july', 'aug', 'sep', 'oct', 'nov', 'dec']
MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def feeds(hid):
    """Kurum başına denenecek sabit kaynaklar (sırayla)."""
    if hid == 'bny':  # aylık PDF, ad kalıbı: emea_fp_checkpoints_<ay><yy>.pdf (ay bazen 3 harf, bazen tam)
        out = []
        for k in range(0, 4):
            m = (TODAY.month - 1 - k) % 12
            y = TODAY.year - (1 if TODAY.month - 1 - k < 0 else 0)
            for mm in dict.fromkeys([MON[m], MON3[m]]):
                out.append(f'https://www.bny.com/assets/investments/imemea/pdfs/emea_fp_checkpoints_{mm}{str(y)[2:]}.pdf')
        return out
    return {
        'blackrock': ['https://www.blackrock.com/corporate/insights/blackrock-investment-institute/publications/weekly-commentary',
                      'https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/weekly-commentary'],
        'vanguard': ['https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html'],
        'jpmorgan': ['https://am.jpmorgan.com/us/en/asset-management/adv/insights/portfolio-insights/ltcma/',
                     'https://am.jpmorgan.com/jp/en/asset-management/institutional/insights/portfolio-insights/ltcma/executive-summary/'],
        'capitalgroup': ['https://www.capitalgroup.com/individual/insights/categories/outlook.html'],
        'statestreet': ['https://www.ssga.com/us/en/intermediary/insights/global-market-outlook'],
        'goldman': ['https://am.gs.com/en-us/advisors/insights/article/investment-outlook'],
        'pimco': ['https://www.pimco.com/us/en/insights/cyclical-outlook'],
        'fidelity': ['https://institutional.fidelity.com/advisors/insights/topics/market-commentary'],
        'amundi': ['https://research-center.amundi.com/'],
    }.get(hid, [])


def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/pdf;q=0.9,*/*;q=0.8'})
    with urllib.request.urlopen(req, timeout=20) as r:
        b = r.read()
        ct = r.headers.get('Content-Type', '')
    if b[:4] == b'%PDF' or 'pdf' in ct:
        try:
            from pypdf import PdfReader
            import io
            txt = '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(b)).pages[:12])
        except Exception as e:
            raise RuntimeError(f'PDF okunamadı: {e}')
    else:
        h = b.decode('utf-8', 'replace')
        h = re.sub(r'(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>', ' ', h)
        txt = re.sub(r'<[^>]+>', ' ', h)
        import html as H
        txt = H.unescape(txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt


def prompt_for(house, themes, text=None):
    keys = '\n'.join(f'- {k}: {v["n"]}' for k, v in themes.items())
    src = f'METİN (yalnızca buna dayan):\n"""{text[:14000]}"""' if text else \
        f"{house['n']} kurumunun ({house.get('brand','')}) yayımladığı EN SON piyasa görünümünü / varlık dağılımı görüşünü internette ara ve yalnızca bulduğun yayına dayan."
    return f"""{src}

GÖREV: Bu yayından {house['n']} kurumunun yatırım görüşlerini çıkar. Yalnızca açıkça yazan görüşleri al; tahmin etme, genelleme yapma.
Tema anahtarları (yalnızca bunları kullan; metin bir temaya değinmiyorsa o temayı YAZMA):
{keys}
Duruş: 1 = olumlu / ağırlık artır / tercih, 0 = nötr, -1 = olumsuz / ağırlık azalt / temkinli.
Metin yalnızca olanı anlatıyor ve öneri içermiyorsa views boş olsun, context'e bir cümle yaz.
YALNIZCA şu JSON'u döndür:
{{"pub":"yayının adı","date":"YYYY-MM-DD yayın tarihi (metinde/yayında yazan; bilmiyorsan null)","views":{{"tema_anahtarı":[duruş,"Türkçe kısa gerekçe"]}},
"strengths":["Türkçe, en fazla 3"],"risks":["Türkçe, en fazla 4"],"context":"Türkçe tek cümle ya da null"}}"""


def _chat(url, key, model, user, timeout=60):
    body = json.dumps({'model': model, 'temperature': 0.1, 'max_tokens': 2000,
                       'messages': [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': user}]}).encode()
    req = urllib.request.Request(url, data=body, headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Accept': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        j = json.loads(r.read())
    txt = j['choices'][0]['message']['content']
    m = re.search(r'\{.*\}', txt, re.S)
    return json.loads(m.group(0))


def ask_text(house, themes, text):
    """Hızlı çağrı: her modelde tek deneme, kısa zaman aşımı (uzun bekleme yok)."""
    user = prompt_for(house, themes, text)
    tries = [('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', GEMINI, m) for m in AI.GEMINI_MODELS] if GEMINI else []
    tok = os.environ.get('GITHUB_TOKEN', '').strip()
    if tok:
        tries.append(('https://models.github.ai/inference/chat/completions', tok, 'openai/gpt-4.1-mini'))
    errs = []
    for url, key, mdl in tries:
        if left() < 60:
            break
        try:
            return _chat(url, key, mdl, user)
        except Exception as e:
            errs.append(f'{mdl}: {type(e).__name__} {str(e)[:80]}')
            time.sleep(3)
    raise RuntimeError(' | '.join(errs) or 'model yok')


def ask_grounded(house, themes):
    """Gemini + Google araması. Kaynaklar groundingMetadata'dan (gerçek arama sonuçları)."""
    if not GEMINI:
        raise RuntimeError('GEMINI_API_KEY yok')
    last = None
    for mdl in AI.GEMINI_MODELS:
        body = json.dumps({'contents': [{'parts': [{'text': prompt_for(house, themes)}]}], 'tools': [{'google_search': {}}],
                           'generationConfig': {'temperature': 0.1}}).encode()
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{mdl}:generateContent?key={urllib.parse.quote(GEMINI)}'
        if left() < 60:
            break
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}), timeout=75) as r:
                j = json.loads(r.read())
        except Exception as e:
            last = e
            time.sleep(5)
            continue
        c = (j.get('candidates') or [{}])[0]
        txt = ''.join(p.get('text', '') for p in (c.get('content') or {}).get('parts', []))
        m = re.search(r'\{.*\}', txt, re.S)
        if not m:
            last = RuntimeError('JSON yok')
            continue
        out = json.loads(m.group(0))
        chunks = ((c.get('groundingMetadata') or {}).get('groundingChunks') or [])
        srcs = [{'uri': (x.get('web') or {}).get('uri'), 'title': (x.get('web') or {}).get('title')} for x in chunks if x.get('web')]
        if not srcs:
            last = RuntimeError('arama kaynağı dönmedi')
            continue
        out['_sources'] = srcs[:5]
        out['_model'] = mdl
        return out
    raise RuntimeError(f'grounding başarısız: {last}')


def valid(res, house, themes):
    d = res.get('date')
    try:
        dd = dt.date.fromisoformat(str(d)[:10])
    except Exception:
        return None, 'tarih okunamadı'
    if dd > TODAY or (TODAY - dd).days > 270:
        return None, f'tarih geçersiz/eski: {dd}'
    if dd <= dt.date.fromisoformat(house['date']):
        return None, f'yeni değil ({dd} ≤ {house["date"]})'
    views = {}
    for k, v in (res.get('views') or {}).items():
        if k in themes and isinstance(v, (list, tuple)) and len(v) >= 2 and v[0] in (-1, 0, 1):
            views[k] = [int(v[0]), str(v[1])[:200]]
    if not views and not res.get('context'):
        return None, 'görüş yok'
    return dict(date=dd.isoformat(), views=views, pub=str(res.get('pub') or '')[:200],
                strengths=[str(x)[:200] for x in (res.get('strengths') or [])][:3], risks=[str(x)[:200] for x in (res.get('risks') or [])][:4],
                context=(str(res['context'])[:300] if res.get('context') else None)), None


def main():
    D = json.load(open(P, encoding='utf-8'))
    themes = D['themes']
    D.setdefault('history', [])
    log = {}
    changed = False
    # en uzun süredir kontrol edilmeyenden başla (süre dolarsa sıradakiler bir sonraki çalışmaya kalır)
    last = (D.get('autoRun') or {}).get('checked', {})
    order = sorted(D['houses'], key=lambda h: last.get(h['id'], ''))
    checked = dict(last)
    for h in order:
        if ONLY and h['id'] not in ONLY:
            continue
        if left() < 120:
            log[h['id']] = 'süre doldu, bir sonraki çalışmaya kaldı'
            continue
        t1 = time.time()
        got, why = None, []
        for url in feeds(h['id']):
            if left() < 90:
                break
            try:
                txt = fetch_text(url)
                if len(txt) < 800:
                    why.append(f'{url}: metin kısa ({len(txt)})')
                    continue
                res = ask_text(h, themes, txt)
                v, err = valid(res, h, themes)
                if v:
                    got = dict(v, url=url, type='otomatik: kaynak metninden özet')
                    break
                why.append(f'{url}: {err}')
            except Exception as e:
                why.append(f'{url}: {type(e).__name__} {str(e)[:120]}')
            time.sleep(2)
        if not got and left() > 90:
            try:
                res = ask_grounded(h, themes)
                v, err = valid(res, h, themes)
                if v:
                    src = res['_sources'][0]
                    got = dict(v, url=src['uri'], sources=res['_sources'], type=f'otomatik: Google araması + {res["_model"]} özeti (bağlantıyı kontrol et)')
                else:
                    why.append(f'arama: {err}')
            except Exception as e:
                why.append(f'arama: {type(e).__name__} {str(e)[:120]}')
        if got:
            old = {k: h[k] for k in ('date', 'pub', 'views', 'url', 'type') if k in h}
            D['history'].append(dict(old, id=h['id'], n=h['n'], archivedAt=TODAY.isoformat()))
            h.update({k: v for k, v in got.items() if v is not None or k == 'context'})
            h['validUntil'] = (dt.date.fromisoformat(h['date']) + dt.timedelta(days=TTL.get(h['id'], 183))).isoformat()
            h['auto'] = True
            changed = True
            log[h['id']] = f'güncellendi → {h["date"]} ({len(h["views"])} görüş)'
        else:
            log[h['id']] = 'değişmedi: ' + ' | '.join(why)[:600]
        checked[h['id']] = dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        print(f"{h['id']}: {log[h['id']][:300]} ({round(time.time() - t1)} sn)", flush=True)
    D['history'] = D['history'][-200:]
    D['autoRun'] = {'at': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'log': log, 'checked': checked, 'sec': round(time.time() - T0)}
    if changed:
        D['updatedAt'] = TODAY.isoformat()
    if not DRY:
        with open(P, 'w', encoding='utf-8') as f:
            json.dump(D, f, ensure_ascii=False, indent=1)
            f.write('\n')
    print(json.dumps(log, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
